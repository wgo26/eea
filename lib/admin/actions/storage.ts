'use server'

import { assertAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, audit, fail, revalidateLocalized, deleteStoredMedia } from './_shared'

export async function queueStorageVerification(mediaId?: string): Promise<ActionResult & { count?: number }> {
  try {
    const { supabase, user } = await assertAdmin()
    let query = supabase.from('media_assets').select('id').eq('verification_status', 'pending')
    if (mediaId) query = query.eq('id', mediaId)
    const { data, error } = await query
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'Nothing to verify — no pending assets found.' }
    const ids = data.map((row) => row.id as string)
    // Skip assets that already have an open verify task — without this every
    // button click inserts duplicates that pile up as pending forever.
    const { data: existing } = await supabase
      .from('storage_tasks')
      .select('media_id')
      .eq('task_type', 'verify')
      .in('status', ['pending', 'processing'])
      .in('media_id', ids)
    const alreadyQueued = new Set((existing ?? []).map((row) => row.media_id as string))
    const fresh = ids.filter((id) => !alreadyQueued.has(id))
    if (fresh.length > 0) {
      const { error: taskError } = await supabase.from('storage_tasks').insert(fresh.map((id) => ({ media_id: id, task_type: 'verify' })))
      if (taskError) return { ok: false, error: taskError.message }
    }
    await audit(supabase, user.id, { action: 'storage:verify:queue', notes: `count=${data?.length ?? 0} new=${fresh.length}` })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true, count: data?.length ?? 0 }
  } catch (e) { return fail(e) }
}

/**
 * Permanently delete one media asset from the Storage tab (admin-only): the
 * stored object is removed from its provider first, then the metadata row
 * (cascades media_text_variants + pending storage_tasks; ad creatives fall
 * back to null via their SET NULL FK). Mirrors deleteContentItem's hardened
 * pattern — authorize (assertAdmin) → destructive work on the service-role
 * client so RLS can never veto an admin cleanup → surfaced per-step errors →
 * audit. The B2 backup copy is intentionally left in place: it is the
 * disaster-recovery mirror, and no B2 delete path is wired.
 */
export async function deleteMediaAsset(mediaId: string): Promise<ActionResult> {
  try {
    const { user } = await assertAdmin()
    const admin = createAdminClient()
    const { data: rows, error: lookupErr } = await admin
      .from('media_assets')
      .select('id, provider, storage_key, content_item_id')
      .eq('id', mediaId)
      .limit(1)
    if (lookupErr) return { ok: false, error: lookupErr.message }
    const row = (rows ?? [])[0] as
      | { id: string; provider: string; storage_key: string | null; content_item_id: string | null }
      | undefined
    if (!row) return { ok: false, error: 'Asset not found.' }

    await deleteStoredMedia(admin, row)

    const { error } = await admin.from('media_assets').delete().eq('id', mediaId)
    if (error) return { ok: false, error: error.message }

    await audit(admin, user.id, {
      action: 'storage:asset:delete',
      entityType: 'media_asset',
      notes: row.storage_key ?? row.id,
    })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/* ------------------------------------------------------------------ */
/* Storage / backup                                                    */
/* ------------------------------------------------------------------ */

export async function triggerBackup(): Promise<ActionResult & { count?: number }> {
  try {
    const { supabase, user } = await assertAdmin()
    // Scope today: R2-hosted originals only (Supabase-hosted + B2 mirror are
    // out of scope for the delta backup). Count first so the UI can report
    // honestly instead of toasting success on zero rows.
    const { data: pending, error: lookupError } = await supabase
      .from('media_assets')
      .select('id')
      .eq('provider', 'r2')
      .is('backed_up_at', null)
    if (lookupError) return { ok: false, error: lookupError.message }
    if (!pending?.length) return { ok: false, error: 'Nothing to queue — all R2 assets are already backed up.' }
    const { error } = await supabase
      .from('media_assets')
      .update({ backup_requested_at: new Date().toISOString() })
      .eq('provider', 'r2')
      .is('backed_up_at', null)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'backup:trigger', notes: `count=${pending.length} scope=r2` })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true, count: pending.length }
  } catch (e) {
    return fail(e)
  }
}

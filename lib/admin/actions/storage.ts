'use server'

import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, audit, fail, revalidateLocalized, deleteStoredMedia } from './_shared'

export async function queueStorageVerification(mediaId?: string): Promise<ActionResult & { count?: number }> {
  try {
    // Supreme tier: storage mutations are chief-only. Reads stay on the
    // caller's RLS-scoped client, so the chief also needs the coarse `admin`
    // row (is_admin()) alongside the `chief_admin` grant.
    const { supabase, user } = await assertCapability('system.owner')
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
 * pattern — authorize (chief-only `system.owner`) → destructive work on the
 * service-role client so RLS can never veto a chief cleanup → surfaced
 * per-step errors → audit. The B2 backup copy is intentionally left in place: it is the
 * disaster-recovery mirror, and no B2 delete path is wired.
 */
export async function deleteMediaAsset(mediaId: string): Promise<ActionResult> {
  try {
    const { user } = await assertCapability('system.owner')
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
/* Task queue operations                                             */
/* ------------------------------------------------------------------ */

/** Completed storage tasks older than this are purged (UI + nightly sweep). */
export const COMPLETED_TASK_RETENTION_DAYS = 30

/**
 * Re-queue every failed storage task: status back to pending, attempts kept
 * for forensics, error cleared. The nightly backup/verify job picks them up
 * on its next pass.
 */
export async function retryFailedTasks(): Promise<ActionResult & { count?: number }> {
  try {
    const { user } = await assertCapability('system.owner')
    const admin = createAdminClient()
    const { data, error: lookupError } = await admin
      .from('storage_tasks')
      .select('id')
      .eq('status', 'failed')
    if (lookupError) return { ok: false, error: lookupError.message }
    if (!data?.length) return { ok: false, error: 'No failed tasks to retry.' }
    const { error } = await admin
      .from('storage_tasks')
      .update({ status: 'pending', last_error: null })
      .eq('status', 'failed')
    if (error) return { ok: false, error: error.message }
    await audit(admin, user.id, { action: 'storage:tasks:retry', notes: `count=${data.length}` })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true, count: data.length }
  } catch (e) { return fail(e) }
}

/** Delete completed tasks older than the retention window (audit-logged). */
export async function purgeCompletedTasks(): Promise<ActionResult & { count?: number }> {
  try {
    const { user } = await assertCapability('system.owner')
    const admin = createAdminClient()
    const cutoff = new Date(Date.now() - COMPLETED_TASK_RETENTION_DAYS * 86_400_000).toISOString()
    const { data, error } = await admin
      .from('storage_tasks')
      .delete()
      .eq('status', 'completed')
      .lt('updated_at', cutoff)
      .select('id')
    if (error) return { ok: false, error: error.message }
    const count = data?.length ?? 0
    await audit(admin, user.id, { action: 'storage:tasks:purge', notes: `count=${count}` })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true, count }
  } catch (e) { return fail(e) }
}

/* ------------------------------------------------------------------ */
/* Storage / backup                                                    */
/* ------------------------------------------------------------------ */

export async function triggerBackup(): Promise<ActionResult & { count?: number }> {
  try {
    const { supabase, user } = await assertCapability('system.owner')
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

'use server'

import { assertAdmin, assertCapability } from '@/lib/admin/auth'
import { type ActionResult, audit, auditBulkOperation, fail, revalidateLocalized } from './_shared'

/* ------------------------------------------------------------------ */
/* Trust & safety (reports + corrections)                              */
/* ------------------------------------------------------------------ */

/**
 * Move a community report through the trust & safety pipeline
 * (investigating -> resolved / dismissed). The note is recorded on the row
 * and in the moderation log so the audit trail shows who decided what.
 */
/** Permanently delete a junk/spam report (admin only — irreversible). */
export async function deleteReport(reportId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { error } = await supabase.from('reports').delete().eq('id', reportId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'report:delete', entityType: 'report', entityId: reportId })
    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function resolveReport(
  reportId: string,
  status: 'investigating' | 'resolved' | 'dismissed',
  notes?: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: report } = await supabase
      .from('reports')
      .select('id, status, content_item_id')
      .eq('id', reportId)
      .single()
    if (!report) return { ok: false, error: 'Report not found.' }
    if (report.status === status) return { ok: true }

    const { error } = await supabase
      .from('reports')
      .update({
        status,
        resolution: notes?.trim() || null,
        updated_at: now,
        resolved_at: status === 'resolved' || status === 'dismissed' ? now : null,
      })
      .eq('id', reportId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: `report:${status}`,
      content_item_id: report.content_item_id ?? null,
      to_status: status,
      notes: notes?.trim() || null,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Same pipeline for content corrections (with the reviewer recorded). */
export async function resolveCorrection(
  correctionId: string,
  status: 'investigating' | 'resolved' | 'dismissed',
  notes?: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: correction } = await supabase
      .from('corrections')
      .select('id, status, content_item_id')
      .eq('id', correctionId)
      .single()
    if (!correction) return { ok: false, error: 'Correction not found.' }
    if (correction.status === status) return { ok: true }

    const { error } = await supabase
      .from('corrections')
      .update({
        status,
        resolution: notes?.trim() || null,
        reviewed_by: user.id,
        resolved_at: status === 'resolved' || status === 'dismissed' ? now : null,
      })
      .eq('id', correctionId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: `correction:${status}`,
      content_item_id: correction.content_item_id ?? null,
      to_status: status,
      notes: notes?.trim() || null,
      actor_id: user.id,
    })

    // D3 — close the correction loop: bring the people who engaged with the
    // article (saved it) and the reader who reported it back to the fixed
    // version. Best-effort: the resolution is already durable above.
    if (status === 'resolved' && correction.content_item_id) {
      await notifyCorrectionResolved(correction.content_item_id).catch(() => {
        /* courtesy copies must never fail the resolution */
      })
    }

    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

const CORRECTION_NOTIFY_CAP = 50

/** D3 — enqueue `correction.resolved` to the reporter + up to 50 savers. */
async function notifyCorrectionResolved(contentItemId: string): Promise<void> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { enqueueUser } = await import('@/lib/notify/queue')
  const admin = createAdminClient()
  const { data: item } = await admin
    .from('content_items')
    .select('translations:content_translations(locale, title)')
    .eq('id', contentItemId)
    .maybeSingle()
  const trs = (item as { translations?: { locale: string; title: string }[] } | null)?.translations ?? []
  const title = (trs.find((t) => t.locale === 'en')?.title ?? trs[0]?.title ?? 'The article').slice(0, 120)

  const recipients = new Set<string>()
  const { data: savers } = await admin
    .from('saved_content')
    .select('user_id')
    .eq('content_item_id', contentItemId)
    .limit(CORRECTION_NOTIFY_CAP)
  for (const row of (savers ?? []) as { user_id: string }[]) recipients.add(row.user_id)
  // Reactors are anonymous (token-only) and cannot be notified; the reporter
  // is the other engaged party the loop must close with.
  const { data: reports } = await admin
    .from('corrections')
    .select('reporter_id')
    .eq('content_item_id', contentItemId)
    .eq('status', 'resolved')
    .not('reporter_id', 'is', null)
    .limit(CORRECTION_NOTIFY_CAP)
  for (const row of (reports ?? []) as { reporter_id: string }[]) recipients.add(row.reporter_id)

  for (const userId of [...recipients].slice(0, CORRECTION_NOTIFY_CAP)) {
    await enqueueUser('correction.resolved', userId, { title }, '/')
  }
}

/**
 * Bulk trust & safety: resolve/dismiss over a selection of content
 * corrections. Same sequential per-item pattern as the moderation bulk actions.
 */
export async function bulkResolveCorrections(
  ids: string[],
  status: 'investigating' | 'resolved' | 'dismissed',
): Promise<ActionResult> {
  let failed = 0
  for (const id of ids) {
    const result = await resolveCorrection(id, status)
    if (!result.ok) failed += 1
  }
  await auditBulkOperation({ action: `correction:bulk_${status}`, resourceType: 'correction', ids, failed })
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} correction(s) failed.` } : { ok: true }
}

export async function bulkDeleteCorrections(ids: string[]): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin()
    let failed = 0
    for (const id of ids) {
      const { error } = await supabase.from('corrections').delete().eq('id', id)
      if (error) failed += 1
    }
    // §53 bulk deletion — corrections had no audit trail beyond the row count.
    await auditBulkOperation({ action: 'correction:bulk_delete', resourceType: 'correction', ids, failed })
    if (failed > 0) return { ok: false, error: `${failed} of ${ids.length} correction(s) failed.` }
    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

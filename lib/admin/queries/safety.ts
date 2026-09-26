import 'server-only'

import { logger } from '@/lib/observability/logger'
import type { Locale } from '@/lib/i18n'
import { db, hasDatabase, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Audit log                                                          */
/* ------------------------------------------------------------------ */

export type ModerationEntry = {
  id: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  notes: string | null
  createdAt: string | null
  actorId: string | null
  actorName: string | null
  contentTitle: string | null
  contentType: string | null
  submissionId: string | null
}

export async function getRecentModeration(options?: {
  limit?: number
  page?: number
  action?: string
  entityType?: string
  actor?: string
  from?: string
  to?: string
  locale?: Locale
  search?: string
  order?: 'newest' | 'oldest'
}): Promise<{ rows: ModerationEntry[]; total: number }> {
  const limit = options?.limit ?? 20
  const page = options?.page ?? 1
  const offset = (page - 1) * limit
  const locale = options?.locale ?? 'en'
  const search = options?.search?.trim() ?? ''
  const ascending = options?.order === 'oldest'
  if (!hasDatabase()) return { rows: [], total: 0 }
  try {
    let query = db()
        .from('moderation_log')
        .select(`id, action, from_status, to_status, notes, created_at, submission_id, entity_type, actor_id,
          actor:profiles(display_name, full_name),
          content:content_items(type, translations:content_translations(locale, title))`, { count: 'exact' })
        .order('created_at', { ascending })
        .range(offset, offset + limit - 1)
    if (options?.action) query = query.eq('action', options.action)
    if (options?.entityType) query = query.eq('entity_type', options.entityType)
    if (options?.actor) query = query.eq('actor_id', options.actor)
    if (options?.from) query = query.gte('created_at', options.from)
    if (options?.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
    if (search) query = query.or(`action.ilike.%${search}%,notes.ilike.%${search}%`)
    const { data, count } = await safe(query)
    const rows = (data ?? []).map((row) => {
      const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor
      const content = Array.isArray(row.content) ? row.content[0] : row.content
      const translations = content && Array.isArray(content.translations) ? content.translations : content?.translations ? [content.translations] : []
      const list = translations as { locale: string; title: string }[]
      const t = list.find((x) => x.locale === locale) ?? list[0]
      return {
        id: row.id,
        action: row.action,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        notes: row.notes,
        createdAt: row.created_at,
        actorId: (row as { actor_id?: string | null }).actor_id ?? null,
        actorName: (actor as { display_name: string | null; full_name: string | null } | undefined)?.display_name ?? (actor as { full_name: string | null } | undefined)?.full_name ?? null,
        contentTitle: t?.title ?? null,
        contentType: content?.type ?? null,
        submissionId: row.submission_id,
      }
    })
    return { rows, total: count ?? 0 }
  } catch (e) {
    logger.error('admin', 'getRecentModeration failed', { error: e })
    return { rows: [], total: 0 }
  }
}

/**
 * Per-item change history for the content edit drawer (version tracking
 * without snapshots): every moderation_log row for the item, newest first —
 * status transitions, edits (with the changed-fields note saveContentItem
 * writes), feature/archive actions. Revert is intentionally out of scope:
 * translations carry no snapshots, so history is audit, not restore.
 */
export async function getContentHistory(contentItemId: string): Promise<ModerationEntry[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('moderation_log')
        .select(`id, action, from_status, to_status, notes, created_at, submission_id, actor_id,
          actor:profiles(display_name, full_name)`)
        .eq('content_item_id', contentItemId)
        .order('created_at', { ascending: false })
        .limit(30),
    )
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
      const actor = (Array.isArray(row.actor) ? row.actor[0] : row.actor) as
        | { display_name: string | null; full_name: string | null }
        | undefined
      return {
        id: row.id as string,
        action: row.action as string,
        fromStatus: (row.from_status as string | null) ?? null,
        toStatus: (row.to_status as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        createdAt: (row.created_at as string | null) ?? null,
        actorId: (row.actor_id as string | null) ?? null,
        actorName: actor?.display_name ?? actor?.full_name ?? null,
        contentTitle: null,
        contentType: null,
        submissionId: (row.submission_id as string | null) ?? null,
      }
    })
  } catch (e) {
    logger.error('admin', 'getContentHistory failed', { error: e })
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Storage / backup                                                   */
/* ------------------------------------------------------------------ */

export type StorageStats = {
  totalAssets: number
  totalBytes: number
  byProvider: { provider: string; count: number; bytes: number }[]
  byDestination: { destination: string; count: number; bytes: number }[]
  byKind: { kind: string; count: number }[]
  pendingBackup: number
  pendingVerification: number
  lastBackupAt: string | null
}

export async function getStorageStats(): Promise<StorageStats> {
  const [assetsRes, pendingRes, verificationRes, backupJobRes] = await Promise.all([
    safe(db().from('media_assets').select('provider, destination, kind, file_size_bytes')),
    safe(db().from('media_assets').select('id', { count: 'exact', head: true }).eq('provider', 'r2').is('backed_up_at', null)),
    safe(db().from('media_assets').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending')),
    safe(
      db().from('backup_jobs').select('last_run_at').eq('job_name', 'storage-mirror').maybeSingle(),
    ),
  ])

  const rows = (assetsRes.data ?? []) as { provider: string; destination: string; kind: string; file_size_bytes: number | null }[]
  const byProvider = new Map<string, { count: number; bytes: number }>()
  const byDestination = new Map<string, { count: number; bytes: number }>()
  const byKind = new Map<string, number>()
  let totalBytes = 0

  for (const row of rows) {
    totalBytes += row.file_size_bytes ?? 0
    const p = byProvider.get(row.provider) ?? { count: 0, bytes: 0 }
    p.count += 1; p.bytes += row.file_size_bytes ?? 0
    byProvider.set(row.provider, p)
    const d = byDestination.get(row.destination) ?? { count: 0, bytes: 0 }
    d.count += 1; d.bytes += row.file_size_bytes ?? 0
    byDestination.set(row.destination, d)
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)
  }

  return {
    totalAssets: rows.length,
    totalBytes,
    byProvider: [...byProvider.entries()].map(([provider, v]) => ({ provider, ...v })),
    byDestination: [...byDestination.entries()].map(([destination, v]) => ({ destination, ...v })),
    byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })),
    pendingBackup: pendingRes.count ?? 0,
    pendingVerification: verificationRes.count ?? 0,
    lastBackupAt:
      ((backupJobRes.data as unknown as { last_run_at: string | null } | null)?.last_run_at ??
        null),
  }
}

export type MediaAssetRow = {
  id: string
  kind: string
  provider: string
  destination: string
  publicUrl: string | null
  storageKey: string | null
  mimeType: string | null
  sizeBytes: number | null
  backedUpAt: string | null
  backupVerifiedAt: string | null
  verificationStatus: string | null
  createdAt: string | null
  /** Set when a content item references this asset — drives the delete warning. */
  contentItemId: string | null
  /** Archive-descriptive columns (migration 20261101000002), surfaced by the
   *  Media archive screen for the `media_admin` role. */
  caption: string | null
  altText: string | null
  credit: string | null
  creator: string | null
  locationText: string | null
  capturedAt: string | null
  copyrightHolder: string | null
  license: string | null
  consentStatus: string | null
  rightsHolder: string | null
  rightsStatus: string | null
  /** Non-null once `archiveMedia` has run; the asset is hidden by default. */
  archivedAt: string | null
}

const MEDIA_COLUMNS =
  'id, kind, provider, destination, public_url, storage_key, mime_type, file_size_bytes, backed_up_at, backup_verified_at, verification_status, created_at, content_item_id, caption, alt_text, credit, creator, location_text, captured_at, copyright_holder, license, consent_status, rights_holder, rights_status, archived_at'

/** Per-asset rows for the storage table (aggregates live in getStorageStats). */
export async function getMediaAssets(options?: {
  page?: number
  limit?: number
  kind?: string
  provider?: string
  backup?: 'backed_up' | 'pending'
  /** Free-text search over caption / alt / credit / creator / rights holder. */
  search?: string
  /**
   * Archived-asset handling. Defaults to `all`, which is what this function has
   * always returned: the storage/backup screen MUST keep seeing archived rows,
   * because the B2 mirror is the disaster-recovery copy and an asset stays
   * backed up whether or not editorial retired it. The media archive screen
   * passes `exclude` explicitly.
   */
  archived?: 'exclude' | 'only' | 'all'
}): Promise<{ rows: MediaAssetRow[]; total: number }> {
  const limit = options?.limit ?? 25
  const page = options?.page ?? 1
  const offset = (page - 1) * limit

  let query = db()
    .from('media_assets')
    .select(MEDIA_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (options?.kind && options.kind !== 'all') query = query.eq('kind', options.kind)
  if (options?.provider && options.provider !== 'all') query = query.eq('provider', options.provider)
  if (options?.backup === 'pending') query = query.is('backed_up_at', null)
  if (options?.backup === 'backed_up') query = query.not('backed_up_at', 'is', null)
  if (options?.search) {
    const term = `%${options.search.replace(/[,%()]/g, ' ')}%`
    query = query.or(`caption.ilike.${term},alt_text.ilike.${term},credit.ilike.${term},creator.ilike.${term},rights_holder.ilike.${term}`)
  }
  // The storage screen never asked for this filter, so its behaviour is
  // unchanged; only the media archive opts into showing archived rows.
  if (options?.archived === 'only') query = query.not('archived_at', 'is', null)
  else if (options?.archived !== 'all') query = query.is('archived_at', null)

  const { data, count } = await safe(query)
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      provider: r.provider as string,
      destination: r.destination as string,
      publicUrl: (r.public_url as string | null) ?? null,
      storageKey: (r.storage_key as string | null) ?? null,
      mimeType: (r.mime_type as string | null) ?? null,
      sizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
      backedUpAt: (r.backed_up_at as string | null) ?? null,
      backupVerifiedAt: (r.backup_verified_at as string | null) ?? null,
      verificationStatus: (r.verification_status as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      contentItemId: (r.content_item_id as string | null) ?? null,
      caption: (r.caption as string | null) ?? null,
      altText: (r.alt_text as string | null) ?? null,
      credit: (r.credit as string | null) ?? null,
      creator: (r.creator as string | null) ?? null,
      locationText: (r.location_text as string | null) ?? null,
      capturedAt: (r.captured_at as string | null) ?? null,
      copyrightHolder: (r.copyright_holder as string | null) ?? null,
      license: (r.license as string | null) ?? null,
      consentStatus: (r.consent_status as string | null) ?? null,
      rightsHolder: (r.rights_holder as string | null) ?? null,
      rightsStatus: (r.rights_status as string | null) ?? null,
      archivedAt: (r.archived_at as string | null) ?? null,
    })),
    total: count ?? 0,
  }
}

/* ------------------------------------------------------------------ */
/* Storage task queue                                                */
/* ------------------------------------------------------------------ */

export type StorageTaskRow = {
  id: string
  taskType: string
  mediaId: string | null
  status: string
  attempts: number
  lastError: string | null
  updatedAt: string | null
}

export type StorageTaskCounts = { pending: number; processing: number; failed: number; completed: number }

/** Queue depth for the storage tab + failed rows for the retry console. */
export async function getStorageTaskCounts(): Promise<StorageTaskCounts> {
  const counts: StorageTaskCounts = { pending: 0, processing: 0, failed: 0, completed: 0 }
  if (!hasDatabase()) return counts
  for (const status of Object.keys(counts) as (keyof StorageTaskCounts)[]) {
    const res = await safe(
      db().from('storage_tasks').select('id', { count: 'exact', head: true }).eq('status', status),
    )
    counts[status] = res.count ?? 0
  }
  return counts
}

export async function getFailedStorageTasks(limit = 25): Promise<StorageTaskRow[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('storage_tasks')
        .select('id, task_type, media_id, status, attempts, last_error, updated_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(limit),
    )
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      taskType: (r.task_type as string | null) ?? '?',
      mediaId: (r.media_id as string | null) ?? null,
      status: (r.status as string | null) ?? 'failed',
      attempts: typeof r.attempts === 'number' ? r.attempts : 0,
      lastError: (r.last_error as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
    }))
  } catch (e) {
    logger.error('admin', 'getFailedStorageTasks failed', { error: e })
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Trust & safety queues (reports + corrections)                      */
/* ------------------------------------------------------------------ */

export type ReportRow = {
  id: string
  reportType: string
  reporterId: string | null
  contentItemId: string | null
  mediaId: string | null
  subject: string | null
  description: string | null
  evidenceUrl: string | null
  status: string
  resolution: string | null
  createdAt: string | null
  updatedAt: string | null
  resolvedAt: string | null
  contentTitle: string | null
  contentType: string | null
  contentSlug: string | null
  contentStatus: string | null
  /** True when the linked content has translations but none in the requested locale. */
  missingLocale: boolean
}

export async function getReports(options?: { status?: string; limit?: number; offset?: number; reportType?: string; locale?: Locale; search?: string }): Promise<ReportRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'
  const search = options?.search?.trim() ?? ''
  let query = db()
    .from('reports')
    .select(`id, report_type, reporter_id, content_item_id, media_id, subject, description, evidence_url,
      status, resolution, created_at, updated_at, resolved_at,
      content:content_items(id, type, slug, status, translations:content_translations(locale, title))`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status !== 'all') query = query.eq('status', status)
  if (options?.reportType) query = query.eq('report_type', options.reportType)
  if (search) query = query.or(`subject.ilike.%${search}%,description.ilike.%${search}%`)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = (row.content as Record<string, unknown> | null) ?? null
    const translations =
      content && Array.isArray(content.translations)
        ? content.translations
        : content?.translations
          ? [content.translations]
          : []
    const t = (translations as { locale: string; title: string | null }[]).find((x) => x.locale === locale)
      ?? (translations[0] as { title: string | null } | undefined)
    const missingLocale = (translations as unknown[]).length > 0 && !(translations as { locale: string }[]).some((x) => x.locale === locale)
    return {
      id: row.id as string,
      reportType: row.report_type as string,
      reporterId: row.reporter_id as string | null,
      contentItemId: row.content_item_id as string | null,
      mediaId: row.media_id as string | null,
      subject: row.subject as string | null,
      description: row.description as string | null,
      evidenceUrl: row.evidence_url as string | null,
      status: row.status as string,
      resolution: row.resolution as string | null,
      createdAt: row.created_at as string | null,
      updatedAt: row.updated_at as string | null,
      resolvedAt: row.resolved_at as string | null,
      contentTitle: t?.title ?? null,
      contentType: (content?.type as string | undefined) ?? null,
      contentSlug: (content?.slug as string | undefined) ?? null,
      contentStatus: (content?.status as string | undefined) ?? null,
      missingLocale,
    }
  })
}

export type CorrectionRow = {
  id: string
  contentItemId: string
  reporterId: string | null
  reporterName: string | null
  reporterEmail: string | null
  correctionText: string
  status: string
  resolution: string | null
  createdAt: string | null
  resolvedAt: string | null
  contentTitle: string | null
  contentType: string | null
  contentSlug: string | null
  contentStatus: string | null
  /** True when the linked content has translations but none in the requested locale. */
  missingLocale: boolean
}

export async function getCorrections(options?: { status?: string; limit?: number; offset?: number; locale?: Locale; search?: string }): Promise<CorrectionRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'
  const search = options?.search?.trim() ?? ''
  let query = db()
    .from('corrections')
    .select(`id, content_item_id, reporter_id, reporter_name, reporter_email, correction_text,
      status, resolution, created_at, resolved_at,
      content:content_items(id, type, slug, status, translations:content_translations(locale, title))`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status !== 'all') query = query.eq('status', status)
  if (search) query = query.or(`correction_text.ilike.%${search}%,reporter_name.ilike.%${search}%,reporter_email.ilike.%${search}%`)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = (row.content as Record<string, unknown> | null) ?? null
    const translations =
      content && Array.isArray(content.translations)
        ? content.translations
        : content?.translations
          ? [content.translations]
          : []
    const t = (translations as { locale: string; title: string | null }[]).find((x) => x.locale === locale)
      ?? (translations[0] as { title: string | null } | undefined)
    const missingLocale = (translations as unknown[]).length > 0 && !(translations as { locale: string }[]).some((x) => x.locale === locale)
    return {
      id: row.id as string,
      contentItemId: row.content_item_id as string,
      reporterId: row.reporter_id as string | null,
      reporterName: row.reporter_name as string | null,
      reporterEmail: row.reporter_email as string | null,
      correctionText: row.correction_text as string,
      status: row.status as string,
      resolution: row.resolution as string | null,
      createdAt: row.created_at as string | null,
      resolvedAt: row.resolved_at as string | null,
      contentTitle: t?.title ?? null,
      contentType: (content?.type as string | undefined) ?? null,
      contentSlug: (content?.slug as string | undefined) ?? null,
      contentStatus: (content?.status as string | undefined) ?? null,
      missingLocale,
    }
  })
}

/** Unfiltered totals for trust-safety tab badges (badges must not reflect the active status filter). */
export async function getTrustSafetyCounts(): Promise<{ reports: number; corrections: number }> {
  if (!hasDatabase()) return { reports: 0, corrections: 0 }
  const [reportsRes, correctionsRes] = await Promise.all([
    safe(db().from('reports').select('id', { count: 'exact', head: true })),
    safe(db().from('corrections').select('id', { count: 'exact', head: true })),
  ])
  return { reports: reportsRes.count ?? 0, corrections: correctionsRes.count ?? 0 }
}

/** Filtered totals for trust-safety pagination (respects the active status pill). */
export async function getTrustSafetyFilteredCounts(status: string): Promise<{ reports: number; corrections: number }> {
  if (!hasDatabase()) return { reports: 0, corrections: 0 }
  const reportsQuery =
    status === 'all'
      ? db().from('reports').select('id', { count: 'exact', head: true })
      : db().from('reports').select('id', { count: 'exact', head: true }).eq('status', status)
  const correctionsQuery =
    status === 'all'
      ? db().from('corrections').select('id', { count: 'exact', head: true })
      : db().from('corrections').select('id', { count: 'exact', head: true }).eq('status', status)
  const [reportsRes, correctionsRes] = await Promise.all([safe(reportsQuery), safe(correctionsQuery)])
  return { reports: reportsRes.count ?? 0, corrections: correctionsRes.count ?? 0 }
}

/**
 * Code-level fallback for the pg_cron job (migration
 * 20260904000000_phase3_content_loop.sql): flips due `scheduled` items to
 * `published` and expires overdue active listings. Called on admin loads —
 * cheap (indexed updates) and idempotent.
 *
 * Phase 3 — owner push: listings the sweep expires notify their owners
 * (`listing.update` → /account/listings, one-tap renew). Expiring-soon
 * (≤24 h) nudges are idempotent via a 7-day moderation_log guard so the
 * daily sweep never spams. All pushes are best-effort and never fail the
 * sweep itself.
 */
export async function runDueContentSweep(): Promise<void> {
  const nowIso = new Date().toISOString()
  await safe(
    db()
      .from('content_items')
      .update({ status: 'published', published_at: nowIso })
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .lte('scheduled_for', nowIso)
      // Mirrors the publish-integrity trigger + cron guard (migration
      // 20261112000000): a locationless row stays scheduled instead of
      // erroring the flip.
      .not('location_id', 'is', null),
  )
  const { data: dueListings } = await safe(
    db()
      .from('content_items')
      .select('id')
      .eq('is_archived', false)
      .not('expires_at', 'is', null)
      .lte('expires_at', nowIso)
      .limit(500),
  )
  const dueIds = ((dueListings ?? []) as { id: string }[]).map((r) => r.id)
  if (dueIds.length > 0) {
    // Capture the flip set BEFORE updating: only rows still 'active' get the
    // one-time expired push (already-expired rows stay silent).
    const { data: activeRows } = await safe(
      db().from('listings').select('content_item_id').in('content_item_id', dueIds).eq('listing_status', 'active'),
    )
    const flipping = ((activeRows ?? []) as { content_item_id: string }[]).map((r) => r.content_item_id)
    await safe(
      db()
        .from('listings')
        .update({ listing_status: 'expired' })
        .in('content_item_id', dueIds)
        .eq('listing_status', 'active'),
    )
    if (flipping.length > 0) {
      const { enqueueUser, listingNotifyTarget } = await import('@/lib/notify/queue')
      const admin = db()
      for (const id of flipping.slice(0, 100)) {
        try {
          const target = await listingNotifyTarget(admin, id)
          await enqueueUser('listing.update', target.userId, { title: target.title, status: 'expired — renew it in one tap' }, '/account/listings')
        } catch { /* best-effort: never fail the sweep */ }
      }
    }
  }
  // Expiring-soon (≤24 h, still active): one nudge per listing per 7 days.
  try {
    const soonIso = new Date(Date.now() + 24 * 3_600_000).toISOString()
    const { data: soonRows } = await safe(
      db()
        .from('content_items')
        .select('id')
        .eq('is_archived', false)
        .not('expires_at', 'is', null)
        .gt('expires_at', nowIso)
        .lte('expires_at', soonIso)
        .limit(200),
    )
    const soonIds = ((soonRows ?? []) as { id: string }[]).map((r) => r.id)
    if (soonIds.length > 0) {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const { data: recent } = await safe(
        db()
          .from('moderation_log')
          .select('content_item_id')
          .in('content_item_id', soonIds)
          .eq('action', 'listing:expiring_soon:system')
          .gte('created_at', weekAgo)
          .limit(200),
      )
      const reminded = new Set(((recent ?? []) as { content_item_id: string | null }[]).map((r) => r.content_item_id))
      const fresh = soonIds.filter((id) => !reminded.has(id))
      if (fresh.length > 0) {
        const { enqueueUser, listingNotifyTarget } = await import('@/lib/notify/queue')
        const admin = db()
        for (const id of fresh.slice(0, 50)) {
          try {
            const target = await listingNotifyTarget(admin, id)
            await enqueueUser('listing.update', target.userId, { title: target.title, status: 'expires within 24 hours — renew from your listings page' }, '/account/listings')
            await admin.from('moderation_log').insert({ action: 'listing:expiring_soon:system', content_item_id: id })
          } catch { /* best-effort */ }
        }
      }
    }
  } catch { /* best-effort: never fail the sweep */ }
}


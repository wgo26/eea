import 'server-only'

import { logger } from '@/lib/observability/logger'
import type { Locale } from '@/lib/i18n'
import { db, hasDatabase, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Unified audit trail                                                */
/*                                                                    */
/* Phase 1.1: `audit_events` (spec §19) is the system-wide trail —    */
/* every privileged action, with actor, resource, request id and      */
/* source. `moderation_log` stays the editorial/moderation pipeline   */
/* (status transitions with from/to, content joins). The admin        */
/* audit-log screen shows both merged, newest first — `origin` tells  */
/* them apart and can filter either side.                             */
/* ------------------------------------------------------------------ */

export type AuditOrigin = 'system' | 'moderation'

export type AuditEventRow = {
  id: string
  action: string
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  resourceType: string
  resourceId: string | null
  requestId: string | null
  source: string | null
  metadata: Record<string, unknown> | null
  createdAt: string | null
}

/** One row of the merged trail — the shape the audit-log page renders. */
export type AuditTrailRow = {
  id: string
  origin: AuditOrigin
  action: string
  resourceType: string | null
  resourceId: string | null
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  source: string | null
  requestId: string | null
  notes: string | null
  fromStatus: string | null
  toStatus: string | null
  contentTitle: string | null
  contentType: string | null
  createdAt: string | null
}

export type AuditTrailOptions = {
  limit?: number
  page?: number
  action?: string
  /** PostgREST column: `audit_events.resource_type` / `moderation_log.entity_type`. */
  resourceType?: string
  actor?: string
  from?: string
  to?: string
  search?: string
  origin?: AuditOrigin | 'all'
  order?: 'newest' | 'oldest'
  locale?: Locale
}

/**
 * `,` and `()` are PostgREST filter separators — a raw search string could
 * splice extra OR branches into the generated query. Whitespace keeps the
 * search semantics (substring match) without the structural risk.
 */
function sanitizeSearch(search: string): string {
  return search.replace(/[,()%]/g, ' ').trim()
}

function asActor(value: unknown): { display_name: string | null; full_name: string | null } | null {
  const row = Array.isArray(value) ? value[0] : value
  return (row as { display_name: string | null; full_name: string | null } | undefined) ?? null
}

/* ------------------------------------------------------------------ */
/* audit_events (system trail)                                        */
/* ------------------------------------------------------------------ */

export async function getAuditEvents(
  options: AuditTrailOptions = {},
): Promise<{ rows: AuditEventRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const limit = options.limit ?? 50
  const page = options.page ?? 1
  const offset = (page - 1) * limit
  const search = options.search?.trim() ? sanitizeSearch(options.search) : ''
  const ascending = options.order === 'oldest'
  try {
    let query = db()
      .from('audit_events')
      .select(`id, action, actor_id, actor_role, resource_type, resource_id, request_id, source, metadata, created_at,
        actor:profiles(display_name, full_name)`, { count: 'exact' })
      .order('created_at', { ascending })
      .range(offset, offset + limit - 1)
    if (options.action) query = query.eq('action', options.action)
    if (options.resourceType) query = query.eq('resource_type', options.resourceType)
    if (options.actor) query = query.eq('actor_id', options.actor)
    if (options.from) query = query.gte('created_at', options.from)
    if (options.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
    if (search) query = query.or(`action.ilike.%${search}%,resource_id.ilike.%${search}%`)
    const { data, count } = await safe(query)
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
      const actor = asActor(row.actor)
      const metadata = row.metadata
      return {
        id: row.id as string,
        action: row.action as string,
        actorId: (row.actor_id as string | null) ?? null,
        actorName: actor?.display_name ?? actor?.full_name ?? null,
        actorRole: (row.actor_role as string | null) ?? null,
        resourceType: row.resource_type as string,
        resourceId: (row.resource_id as string | null) ?? null,
        requestId: (row.request_id as string | null) ?? null,
        source: (row.source as string | null) ?? null,
        metadata:
          metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : null,
        createdAt: (row.created_at as string | null) ?? null,
      }
    })
    return { rows, total: count ?? 0 }
  } catch (e) {
    logger.error('admin', 'getAuditEvents failed', { error: e })
    return { rows: [], total: 0 }
  }
}

/* ------------------------------------------------------------------ */
/* Source queries for the merged trail                                */
/* ------------------------------------------------------------------ */

async function queryAuditSource(
  options: AuditTrailOptions,
  offset: number,
  limit: number,
  ascending: boolean,
): Promise<AuditTrailRow[]> {
  const search = options.search?.trim() ? sanitizeSearch(options.search) : ''
  let query = db()
    .from('audit_events')
    .select(`id, action, actor_id, actor_role, resource_type, resource_id, request_id, source, created_at,
      actor:profiles(display_name, full_name)`)
    .order('created_at', { ascending })
    .range(offset, offset + limit - 1)
  if (options.action) query = query.eq('action', options.action)
  if (options.resourceType) query = query.eq('resource_type', options.resourceType)
  if (options.actor) query = query.eq('actor_id', options.actor)
  if (options.from) query = query.gte('created_at', options.from)
  if (options.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
  if (search) query = query.or(`action.ilike.%${search}%,resource_id.ilike.%${search}%`)
  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const actor = asActor(row.actor)
    return {
      id: row.id as string,
      origin: 'system' as const,
      action: row.action as string,
      resourceType: (row.resource_type as string | null) ?? null,
      resourceId: (row.resource_id as string | null) ?? null,
      actorId: (row.actor_id as string | null) ?? null,
      actorName: actor?.display_name ?? actor?.full_name ?? null,
      actorRole: (row.actor_role as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      requestId: (row.request_id as string | null) ?? null,
      notes: null,
      fromStatus: null,
      toStatus: null,
      contentTitle: null,
      contentType: null,
      createdAt: (row.created_at as string | null) ?? null,
    }
  })
}

async function queryModerationSource(
  options: AuditTrailOptions,
  offset: number,
  limit: number,
  ascending: boolean,
  locale: Locale = 'en',
): Promise<AuditTrailRow[]> {
  const search = options.search?.trim() ? sanitizeSearch(options.search) : ''
  let query = db()
    .from('moderation_log')
    .select(`id, action, from_status, to_status, notes, created_at, entity_type, actor_id,
      actor:profiles(display_name, full_name),
      content:content_items(type, translations:content_translations(locale, title))`)
    .order('created_at', { ascending })
    .range(offset, offset + limit - 1)
  if (options.action) query = query.eq('action', options.action)
  if (options.resourceType) query = query.eq('entity_type', options.resourceType)
  if (options.actor) query = query.eq('actor_id', options.actor)
  if (options.from) query = query.gte('created_at', options.from)
  if (options.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
  if (search) query = query.or(`action.ilike.%${search}%,notes.ilike.%${search}%`)
  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const actor = asActor(row.actor)
    const content = (Array.isArray(row.content) ? row.content[0] : row.content) as
      | Record<string, unknown>
      | null
      | undefined
    const translations = content && Array.isArray(content.translations)
      ? content.translations
      : content?.translations
        ? [content.translations]
        : []
    const list = translations as { locale: string; title: string }[]
    const t = list.find((x) => x.locale === locale) ?? list[0]
    return {
      id: row.id as string,
      origin: 'moderation' as const,
      action: row.action as string,
      resourceType: (row.entity_type as string | null) ?? null,
      resourceId: null,
      actorId: (row.actor_id as string | null) ?? null,
      actorName: actor?.display_name ?? actor?.full_name ?? null,
      actorRole: null,
      source: null,
      requestId: null,
      notes: (row.notes as string | null) ?? null,
      fromStatus: (row.from_status as string | null) ?? null,
      toStatus: (row.to_status as string | null) ?? null,
      contentTitle: t?.title ?? null,
      contentType: (content?.type as string | undefined) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }
  })
}

/** Newest-first (or oldest-first) with a deterministic id tie-break. */
function compareTrail(a: AuditTrailRow, b: AuditTrailRow, ascending: boolean): number {
  const at = a.createdAt ?? ''
  const bt = b.createdAt ?? ''
  if (at !== bt) return ascending ? (at < bt ? -1 : 1) : at > bt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

async function countModeration(options: AuditTrailOptions, search: string): Promise<number> {
  let query = db().from('moderation_log').select('id', { count: 'exact', head: true })
  if (options.action) query = query.eq('action', options.action)
  if (options.resourceType) query = query.eq('entity_type', options.resourceType)
  if (options.actor) query = query.eq('actor_id', options.actor)
  if (options.from) query = query.gte('created_at', options.from)
  if (options.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
  if (search) query = query.or(`action.ilike.%${search}%,notes.ilike.%${search}%`)
  const { count } = await safe(query)
  return count ?? 0
}

/**
 * Merged, paginated view of both audit sources. Each source is fetched up to
 * the end of the requested page (identical filters), merged in memory, then
 * sliced — the two tables share no ordering key, so a SQL-level union is not
 * available (and a view would drift the generated-types CI gate).
 */
export async function getAuditTrail(
  options: AuditTrailOptions = {},
): Promise<{ rows: AuditTrailRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const limit = options.limit ?? 50
  const page = options.page ?? 1
  const origin = options.origin ?? 'all'
  const ascending = options.order === 'oldest'
  const search = options.search?.trim() ? sanitizeSearch(options.search) : ''
  const fetchCount = page * limit

  const wantSystem = origin !== 'moderation'
  const wantModeration = origin !== 'system'

  try {
    const [auditRows, moderationRows, systemTotal, moderationTotal] = await Promise.all([
      wantSystem ? queryAuditSource(options, 0, fetchCount, ascending) : Promise.resolve([]),
      wantModeration
        ? queryModerationSource(options, 0, fetchCount, ascending, options.locale ?? 'en')
        : Promise.resolve([]),
      wantSystem
        ? safe(
            (() => {
              let q = db().from('audit_events').select('id', { count: 'exact', head: true })
              if (options.action) q = q.eq('action', options.action)
              if (options.resourceType) q = q.eq('resource_type', options.resourceType)
              if (options.actor) q = q.eq('actor_id', options.actor)
              if (options.from) q = q.gte('created_at', options.from)
              if (options.to) q = q.lte('created_at', `${options.to}T23:59:59.999Z`)
              if (search) q = q.or(`action.ilike.%${search}%,resource_id.ilike.%${search}%`)
              return q
            })(),
          ).then((r) => r.count ?? 0)
        : Promise.resolve(0),
      wantModeration ? countModeration(options, search) : Promise.resolve(0),
    ])

    const merged = [...auditRows, ...moderationRows].sort((a, b) => compareTrail(a, b, ascending))
    const start = (page - 1) * limit
    return { rows: merged.slice(start, start + limit), total: systemTotal + moderationTotal }
  } catch (e) {
    logger.error('admin', 'getAuditTrail failed', { error: e })
    return { rows: [], total: 0 }
  }
}

/**
 * Streaming CSV source: a two-way merge over both sources' ascending offsets,
 * so an export never re-fetches the same rows (no O(n²) paging) and only the
 * current chunk of each source is held in memory.
 */
export async function* exportAuditTrail(
  options: AuditTrailOptions = {},
): AsyncGenerator<AuditTrailRow[]> {
  if (!hasDatabase()) return
  const pageSize = 500
  const ascending = options.order === 'oldest'
  const origin = options.origin ?? 'all'
  let audit = { rows: [] as AuditTrailRow[], offset: 0, done: origin === 'moderation' }
  let moderation = { rows: [] as AuditTrailRow[], offset: 0, done: origin === 'system' }
  let buffer: AuditTrailRow[] = []

  while (true) {
    if (audit.rows.length === 0 && !audit.done) {
      const rows = await queryAuditSource(options, audit.offset, pageSize, ascending)
      audit = { rows, offset: audit.offset + rows.length, done: rows.length < pageSize }
    }
    if (moderation.rows.length === 0 && !moderation.done) {
      const rows = await queryModerationSource(
        options,
        moderation.offset,
        pageSize,
        ascending,
        options.locale ?? 'en',
      )
      moderation = { rows, offset: moderation.offset + rows.length, done: rows.length < pageSize }
    }
    const nextSystem = audit.rows[0]
    const nextModeration = moderation.rows[0]
    if (!nextSystem && !nextModeration) break
    const takeSystem =
      !nextModeration || (nextSystem && compareTrail(nextSystem, nextModeration, ascending) <= 0)
    buffer.push(takeSystem ? audit.rows.shift()! : moderation.rows.shift()!)
    if (buffer.length >= pageSize) {
      yield buffer
      buffer = []
    }
  }
  if (buffer.length > 0) yield buffer
}

/* ------------------------------------------------------------------ */
/* Filter options                                                     */
/* ------------------------------------------------------------------ */

export type AuditFilterOptions = {
  actions: string[]
  resourceTypes: string[]
  /** Legacy alias — the audit-log filter dropdowns read `entityTypes`. */
  entityTypes: string[]
  sources: string[]
}
/** Distinct action / resource-type / source values for the audit-log filters. */
export async function getAuditFilterOptions(): Promise<AuditFilterOptions> {
  if (!hasDatabase()) return { actions: [], resourceTypes: [], entityTypes: [], sources: [] }
  const [auditRes, moderationActionsRes, moderationEntitiesRes] = await Promise.all([
    safe(
      db().from('audit_events').select('action, resource_type, source').limit(5000),
    ),
    safe(db().from('moderation_log').select('action').limit(5000)),
    safe(db().from('moderation_log').select('entity_type').limit(5000)),
  ])
  const uniqSorted = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b))

  const auditRows = (auditRes.data ?? []) as unknown as {
    action: string | null
    resource_type: string | null
    source: string | null
  }[]
  const resourceTypes = uniqSorted([
    ...auditRows.map((r) => r.resource_type),
    ...(moderationEntitiesRes.data ?? []).map((r) => (r as { entity_type: string | null }).entity_type),
  ])
  return {
    actions: uniqSorted([
      ...auditRows.map((r) => r.action),
      ...(moderationActionsRes.data ?? []).map((r) => (r as { action: string }).action),
    ]),
    resourceTypes,
    entityTypes: resourceTypes,
    sources: uniqSorted(auditRows.map((r) => r.source)),
  }
}

export type AuditActorOption = { id: string; name: string }

/**
 * Recent distinct actors for the audit-log actor filter. Newest-first sample
 * across both sources, merged in memory — the filter itself is an exact
 * `actor_id` match, so this list only needs to cover the humans who act.
 */
export async function getAuditActorOptions(limit = 100): Promise<AuditActorOption[]> {
  if (!hasDatabase()) return []
  const [systemRes, moderationRes] = await Promise.all([
    safe(
      db()
        .from('audit_events')
        .select('actor_id, created_at, actor:profiles(display_name, full_name)')
        .not('actor_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
    safe(
      db()
        .from('moderation_log')
        .select('actor_id, created_at, actor:profiles(display_name, full_name)')
        .not('actor_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000),
    ),
  ])
  const byId = new Map<string, AuditActorOption>()
  for (const res of [systemRes, moderationRes]) {
    for (const row of ((res.data ?? []) as unknown as Record<string, unknown>[])) {
      const id = row.actor_id as string | null
      if (!id || byId.has(id)) continue
      const actor = asActor(row.actor)
      byId.set(id, {
        id,
        name: actor?.display_name ?? actor?.full_name ?? id.slice(0, 8),
      })
      if (byId.size >= limit) return [...byId.values()]
    }
  }
  return [...byId.values()]
}

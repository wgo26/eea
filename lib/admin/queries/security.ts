import 'server-only'

import { logger } from '@/lib/observability/logger'
import { db, hasDatabase, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Security monitoring (plan Phase 4.6, spec §53)                     */
/*                                                                    */
/* Everything here reads `audit_events` — the same trail the audit-log */
/* screen shows, filtered down to the actions §53 names: repeated      */
/* failed logins, session activity, permission escalation, credential  */
/* rotation/revocation, unusual API activity, bulk deletion and large  */
/* publishing operations. No separate security table exists on        */
/* purpose: one trail, two lenses (audit-log = everything, security =  */
/* the security-relevant slice).                                       */
/* ------------------------------------------------------------------ */

export const SECURITY_CATEGORIES = ['auth', 'permissions', 'credentials', 'bulk', 'state'] as const
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number]

export function isSecurityCategory(value: unknown): value is SecurityCategory {
  return typeof value === 'string' && (SECURITY_CATEGORIES as readonly string[]).includes(value)
}

/**
 * The security-relevant action vocabulary. Kept as data (not branches) so a
 * new security-sensitive action is one entry here — and mirrored by the
 * `bulk` pattern below for the bulk server actions, which carry their
 * operation in the action name (`report:bulk_delete`, `correction:bulk_*`, …).
 */
export const SECURITY_ACTIONS: Record<string, SecurityCategory> = {
  // §53 repeated failed logins + suspicious session activity
  'auth.login.failed': 'auth',
  'auth.login.blocked': 'auth',
  'auth.login.succeeded': 'auth',
  'auth.mfa.challenge': 'auth',
  'auth.logout': 'auth',
  // §53 permission escalation
  'user:role:assign': 'permissions',
  'user:role:remove': 'permissions',
  'user:suspended': 'permissions',
  'user:banned': 'permissions',
  'user:active': 'permissions',
  'user:delete': 'permissions',
  // §53 credential rotation / revocation
  'credential.created': 'credentials',
  'credential.rotated': 'credentials',
  'credential.revealed': 'credentials',
  'credential.validated': 'credentials',
  'credential.updated': 'credentials',
  'credential.disabled': 'credentials',
  'credential.enabled': 'credentials',
  'credential.revoked': 'credentials',
  'secret.revoke': 'credentials',
  // §53 unusual platform activity — the loudest state transitions
  'state.activated': 'state',
  'state.deactivated': 'state',
  'incident.critical_mode': 'state',
  'incident.critical_mode_activated': 'state',
}

/** Bulk server actions are named `<entity>:bulk_<verb>`; matched, not enumerated. */
const BULK_PATTERN = '%:bulk_%'

export function categorizeSecurityAction(action: string): SecurityCategory | null {
  return SECURITY_ACTIONS[action] ?? (action.includes(':bulk_') ? 'bulk' : null)
}

const SECURITY_ACTION_NAMES = Object.keys(SECURITY_ACTIONS)

/**
 * One `or=` expression covering the named vocabulary plus the bulk pattern.
 * Values are quoted so the `:` and `.` inside an action name cannot be read
 * as PostgREST syntax.
 */
function securityActionFilter(category?: SecurityCategory | 'all'): string {
  const names = category && category !== 'all'
    ? SECURITY_ACTION_NAMES.filter((action) => SECURITY_ACTIONS[action] === category)
    : SECURITY_ACTION_NAMES
  const clauses: string[] = []
  if (names.length > 0) clauses.push(`action.in.(${names.map((n) => `"${n}"`).join(',')})`)
  if (!category || category === 'all' || category === 'bulk') {
    clauses.push(`action.ilike.${BULK_PATTERN}`)
  }
  // An empty clause list would make `or()` match everything — categories that
  // resolve to no vocabulary entry (nothing today) return an impossible filter.
  return clauses.length > 0 ? clauses.join(',') : 'action.eq.__none__'
}

export type SecurityEventRow = {
  id: string
  action: string
  category: SecurityCategory | null
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  resourceType: string
  resourceId: string | null
  source: string | null
  metadata: Record<string, unknown> | null
  createdAt: string | null
}

export type SecurityEventsOptions = {
  limit?: number
  page?: number
  category?: SecurityCategory | 'all'
  actor?: string
  from?: string
  to?: string
}

function asActor(value: unknown): { display_name: string | null; full_name: string | null } | null {
  const row = Array.isArray(value) ? value[0] : value
  return (row as { display_name: string | null; full_name: string | null } | undefined) ?? null
}

function toEventRow(row: Record<string, unknown>): SecurityEventRow {
  const actor = asActor(row.actor)
  const metadata = row.metadata
  const action = row.action as string
  return {
    id: row.id as string,
    action,
    category: categorizeSecurityAction(action),
    actorId: (row.actor_id as string | null) ?? null,
    actorName: actor?.display_name ?? actor?.full_name ?? null,
    actorRole: (row.actor_role as string | null) ?? null,
    resourceType: row.resource_type as string,
    resourceId: (row.resource_id as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : null,
    createdAt: (row.created_at as string | null) ?? null,
  }
}

const EVENT_SELECT = `id, action, actor_id, actor_role, resource_type, resource_id, source, metadata, created_at,
  actor:profiles(display_name, full_name)`

/** Paginated security slice of the system trail, newest first. */
export async function getSecurityEvents(
  options: SecurityEventsOptions = {},
): Promise<{ rows: SecurityEventRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const limit = options.limit ?? 50
  const page = options.page ?? 1
  const offset = (page - 1) * limit
  try {
    let query = db()
      .from('audit_events')
      .select(EVENT_SELECT, { count: 'exact' })
      .or(securityActionFilter(options.category ?? 'all'))
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (options.actor) query = query.eq('actor_id', options.actor)
    if (options.from) query = query.gte('created_at', options.from)
    if (options.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
    const { data, count } = await safe(query)
    return {
      rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(toEventRow),
      total: count ?? 0,
    }
  } catch (e) {
    logger.error('admin', 'getSecurityEvents failed', { error: e })
    return { rows: [], total: 0 }
  }
}

/**
 * Streaming export source for the security CSV: pages the same filtered
 * slice oldest-first in 500-row chunks — one pass, bounded memory.
 */
export async function* exportSecurityTrail(
  options: SecurityEventsOptions = {},
): AsyncGenerator<SecurityEventRow[]> {
  if (!hasDatabase()) return
  const pageSize = 500
  let page = 1
  for (;;) {
    let query = db()
      .from('audit_events')
      .select(EVENT_SELECT)
      .or(securityActionFilter(options.category ?? 'all'))
      .order('created_at', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (options.actor) query = query.eq('actor_id', options.actor)
    if (options.from) query = query.gte('created_at', options.from)
    if (options.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
    const { data } = await safe(query)
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(toEventRow)
    if (rows.length === 0) return
    yield rows
    if (rows.length < pageSize) return
    page += 1
  }
}

export type SecurityCounts = Record<SecurityCategory, number> & { total: number }

const EMPTY_COUNTS: SecurityCounts = {
  total: 0,
  auth: 0,
  permissions: 0,
  credentials: 0,
  bulk: 0,
  state: 0,
}

/**
 * Per-category totals for the timeline tabs. The categories are disjoint
 * (an action maps to exactly one, and bulk matches a name pattern nothing
 * else uses), so `total` is their sum — one query per category, no scan.
 */
export async function getSecurityCounts(): Promise<SecurityCounts> {
  if (!hasDatabase()) return { ...EMPTY_COUNTS }
  try {
    const results = await Promise.all(
      SECURITY_CATEGORIES.map(async (category) => {
        const { count } = await safe(
          db()
            .from('audit_events')
            .select('id', { count: 'exact', head: true })
            .or(securityActionFilter(category)),
        )
        return [category, count ?? 0] as const
      }),
    )
    const counts = { ...EMPTY_COUNTS }
    for (const [category, value] of results) counts[category] = value
    counts.total = SECURITY_CATEGORIES.reduce((sum, category) => sum + counts[category], 0)
    return counts
  } catch (e) {
    logger.error('admin', 'getSecurityCounts failed', { error: e })
    return { ...EMPTY_COUNTS }
  }
}

/* ------------------------------------------------------------------ */
/* Failed logins (spec §53 "repeated failed logins")                  */
/* ------------------------------------------------------------------ */

/** Attempts per identifier before the security view calls it a repeat. */
export const REPEAT_LOGIN_THRESHOLD = 5

/** Hard cap on the rows aggregated per window — the heat map is a trend. */
const LOGIN_SCAN_LIMIT = 2000

export type LoginHeatCell = { day: number; hour: number; count: number }

export type LoginIdentityStat = {
  /** Truncated HMAC from the audit row — never an email address. */
  identifier: string
  count: number
  blocked: number
  lastAt: string | null
}

export type LoginIpStat = { ip: string; count: number; blocked: number }

export type FailedLoginReport = {
  windowDays: number
  total: number
  blocked: number
  uniqueIdentifiers: number
  uniqueIps: number
  /** day × hour grid (UTC), 0=Sunday — the heat map. */
  cells: LoginHeatCell[]
  topIdentifiers: LoginIdentityStat[]
  topIps: LoginIpStat[]
  /** Identifiers at or over REPEAT_LOGIN_THRESHOLD, busiest first. */
  repeated: LoginIdentityStat[]
}

const EMPTY_LOGIN_REPORT = (windowDays: number): FailedLoginReport => ({
  windowDays,
  total: 0,
  blocked: 0,
  uniqueIdentifiers: 0,
  uniqueIps: 0,
  cells: [],
  topIdentifiers: [],
  topIps: [],
  repeated: [],
})

function stringField(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Failed + blocked sign-in attempts over the window, aggregated into a
 * day/hour grid and per-identity/IP leaderboards. Rows are scanned in memory
 * (bounded by LOGIN_SCAN_LIMIT) because the grouping is over JSON metadata,
 * which PostgREST cannot aggregate.
 */
export async function getFailedLoginAttempts(
  options: { windowDays?: number; top?: number } = {},
): Promise<FailedLoginReport> {
  const windowDays = Math.min(Math.max(options.windowDays ?? 7, 1), 90)
  if (!hasDatabase()) return EMPTY_LOGIN_REPORT(windowDays)
  const top = options.top ?? 8
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  try {
    const { data } = await safe(
      db()
        .from('audit_events')
        .select('id, action, metadata, created_at')
        .in('action', ['auth.login.failed', 'auth.login.blocked'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(LOGIN_SCAN_LIMIT),
    )
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const cells = new Map<string, LoginHeatCell>()
    const identities = new Map<string, LoginIdentityStat>()
    const ips = new Map<string, LoginIpStat>()
    let blocked = 0

    for (const row of rows) {
      const action = row.action as string
      const isBlocked = action === 'auth.login.blocked'
      if (isBlocked) blocked += 1
      const createdAt = (row.created_at as string | null) ?? null
      const metadata =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null

      if (createdAt) {
        const at = new Date(createdAt)
        if (!Number.isNaN(at.getTime())) {
          const key = `${at.getUTCDay()}-${at.getUTCHours()}`
          const cell = cells.get(key) ?? { day: at.getUTCDay(), hour: at.getUTCHours(), count: 0 }
          cell.count += 1
          cells.set(key, cell)
        }
      }

      const identifier = stringField(metadata, 'identifier')
      if (identifier) {
        const stat = identities.get(identifier) ?? { identifier, count: 0, blocked: 0, lastAt: null }
        stat.count += 1
        if (isBlocked) stat.blocked += 1
        // Rows arrive newest-first, so the first timestamp wins.
        if (!stat.lastAt) stat.lastAt = createdAt
        identities.set(identifier, stat)
      }

      const ip = stringField(metadata, 'ip')
      if (ip) {
        const stat = ips.get(ip) ?? { ip, count: 0, blocked: 0 }
        stat.count += 1
        if (isBlocked) stat.blocked += 1
        ips.set(ip, stat)
      }
    }

    const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count
    const identityList = [...identities.values()].sort(byCount)
    return {
      windowDays,
      total: rows.length,
      blocked,
      uniqueIdentifiers: identities.size,
      uniqueIps: ips.size,
      cells: [...cells.values()].sort((a, b) => a.day - b.day || a.hour - b.hour),
      topIdentifiers: identityList.slice(0, top),
      topIps: [...ips.values()].sort(byCount).slice(0, top),
      repeated: identityList.filter((s) => s.count >= REPEAT_LOGIN_THRESHOLD).slice(0, top),
    }
  } catch (e) {
    logger.error('admin', 'getFailedLoginAttempts failed', { error: e })
    return EMPTY_LOGIN_REPORT(windowDays)
  }
}

/* ------------------------------------------------------------------ */
/* Suspicious activity (spec §53 bulk ops + escalation)               */
/* ------------------------------------------------------------------ */

/** A single bulk call touching this many rows or more is flagged "large". */
export const LARGE_OPERATION_THRESHOLD = 25

const SUSPICIOUS_SCAN_LIMIT = 200

export type SuspiciousActivityReport = {
  windowDays: number
  bulk: SecurityEventRow[]
  escalation: SecurityEventRow[]
  critical: SecurityEventRow[]
  /** Bulk calls whose selection met LARGE_OPERATION_THRESHOLD. */
  large: SecurityEventRow[]
}

const EMPTY_SUSPICIOUS = (windowDays: number): SuspiciousActivityReport => ({
  windowDays,
  bulk: [],
  escalation: [],
  critical: [],
  large: [],
})

function selectionSize(row: SecurityEventRow): number {
  const value = row.metadata?.selection
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Anomalous patterns: bulk operations (destructive or publishing), privilege
 * escalation, and critical-mode transitions. Also returns the subset of bulk
 * calls that moved a large selection — the "large publishing operations" half
 * of §53 — so the page can surface them without re-deriving the threshold.
 */
export async function getSuspiciousActivity(
  options: { windowDays?: number; limit?: number } = {},
): Promise<SuspiciousActivityReport> {
  const windowDays = Math.min(Math.max(options.windowDays ?? 30, 1), 365)
  if (!hasDatabase()) return EMPTY_SUSPICIOUS(windowDays)
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  try {
    const { data } = await safe(
      db()
        .from('audit_events')
        .select(EVENT_SELECT)
        .or(
          securityActionFilter('bulk') +
            ',' +
            securityActionFilter('permissions') +
            ',' +
            securityActionFilter('state'),
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(options.limit ?? SUSPICIOUS_SCAN_LIMIT),
    )
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(toEventRow)
    return {
      windowDays,
      bulk: rows.filter((r) => r.category === 'bulk'),
      escalation: rows.filter((r) => r.category === 'permissions'),
      critical: rows.filter((r) => r.category === 'state'),
      large: rows.filter((r) => r.category === 'bulk' && selectionSize(r) >= LARGE_OPERATION_THRESHOLD),
    }
  } catch (e) {
    logger.error('admin', 'getSuspiciousActivity failed', { error: e })
    return EMPTY_SUSPICIOUS(windowDays)
  }
}

/* ------------------------------------------------------------------ */
/* Credential lifecycle (spec §53 rotation / revocation)              */
/* ------------------------------------------------------------------ */

export type CredentialChangeRow = {
  id: string
  credentialId: string
  credentialName: string | null
  provider: string | null
  action: string
  actorId: string | null
  actorName: string | null
  createdAt: string | null
}

/**
 * Reads the credential domain log (`credential_events`, spec §14/§55) rather
 * than the audit mirror: it is the complete lifecycle — including the
 * validation failures and `old_revoked` retirements the audit mirror never
 * sees. Carries no secret material; the table has no column for it.
 */
export async function getCredentialChanges(
  options: { limit?: number; credentialId?: string } = {},
): Promise<CredentialChangeRow[]> {
  if (!hasDatabase()) return []
  try {
    let query = db()
      .from('credential_events')
      .select(`id, credential_id, action, actor_id, created_at,
        credential:api_credentials(name, provider),
        actor:profiles(display_name, full_name)`)
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 25)
    if (options.credentialId) query = query.eq('credential_id', options.credentialId)
    const { data } = await safe(query)
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
      const credential = (Array.isArray(row.credential) ? row.credential[0] : row.credential) as
        | { name: string | null; provider: string | null }
        | null
        | undefined
      const actor = asActor(row.actor)
      return {
        id: row.id as string,
        credentialId: row.credential_id as string,
        credentialName: credential?.name ?? null,
        provider: credential?.provider ?? null,
        action: row.action as string,
        actorId: (row.actor_id as string | null) ?? null,
        actorName: actor?.display_name ?? actor?.full_name ?? null,
        createdAt: (row.created_at as string | null) ?? null,
      }
    })
  } catch (e) {
    logger.error('admin', 'getCredentialChanges failed', { error: e })
    return []
  }
}

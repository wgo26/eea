import 'server-only'

import {
  deriveRotationCycle,
  effectiveCredentialStatus,
  nextRotationDueAt,
  toCredentialRecord,
  type CredentialRecord,
  type CredentialStatus,
  type RotationCycle,
} from '@/lib/security/credential-manager'
import { db, hasDatabase, safe } from './shared'

/**
 * Read side of secret management (plan Phase 2.2). Every read is metadata-only
 * — `secret_encrypted` is never selected here, so no screen can render a value
 * even by accident (spec §13/§16). Plaintext exists in exactly one place in the
 * app: the creation/rotation response and the validation probe in
 * `lib/security/credential-manager.ts`.
 */

export type CredentialEventRow = {
  id: string
  action: string
  actorId: string | null
  actorName: string | null
  requestId: string | null
  source: string | null
  createdAt: string | null
}

export type CredentialListRow = CredentialRecord & {
  /** `active` + past expiry reads as `expired` — see effectiveCredentialStatus. */
  effectiveStatus: CredentialStatus
  createdByName: string | null
  nextRotationDueAt: string | null
}

export type CredentialDetail = CredentialListRow & {
  events: CredentialEventRow[]
  rotation: RotationCycle
}

export type CredentialFilters = {
  status?: CredentialStatus | 'all'
  provider?: string
}

const COLUMNS = `id, name, provider, status, created_by, created_at, updated_at, last_used_at,
  expires_at, rotation_policy, metadata,
  creator:profiles(display_name, full_name)`

type Creator = { display_name: string | null; full_name: string | null } | null

function asCreator(value: unknown): Creator {
  const row = Array.isArray(value) ? value[0] : value
  return (row as Creator | undefined) ?? null
}

/** `expired` is derived (nothing sweeps `expires_at`), so it filters on the pair. */
function applyFilters<T extends { eq: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
  query: T,
  filters: CredentialFilters,
): T {
  let q = query
  if (filters.provider) q = q.eq('provider', filters.provider)
  if (filters.status === 'expired') {
    q = q.eq('status', 'active').lt('expires_at', new Date().toISOString())
  } else if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status)
  }
  return q
}

function toListRow(row: Record<string, unknown>): CredentialListRow {
  const record = toCredentialRecord(row)
  const creator = asCreator(row.creator)
  return {
    ...record,
    effectiveStatus: effectiveCredentialStatus(record),
    createdByName: creator?.display_name ?? creator?.full_name ?? null,
    nextRotationDueAt: nextRotationDueAt(record),
  }
}

export type CredentialListResult = {
  rows: CredentialListRow[]
  providers: string[]
  total: number
}

export async function getCredentialsAdmin(
  filters: CredentialFilters = {},
): Promise<CredentialListResult> {
  if (!hasDatabase()) return { rows: [], providers: [], total: 0 }
  const rowsQuery = applyFilters(
    db().from('api_credentials').select(COLUMNS, { count: 'exact' }),
    filters,
  ).order('created_at', { ascending: false })
  const [rowsResult, providerResult] = await Promise.all([
    safe(rowsQuery),
    safe(db().from('api_credentials').select('provider').limit(2000)),
  ])
  const rows = ((rowsResult.data ?? []) as unknown as Record<string, unknown>[]).map(toListRow)
  const providers = [
    ...new Set(
      ((providerResult.data ?? []) as unknown as { provider: string | null }[])
        .map((r) => r.provider)
        .filter((p): p is string => Boolean(p)),
    ),
  ].sort((a, b) => a.localeCompare(b))
  return { rows, providers, total: rowsResult.count ?? rows.length }
}

export async function getCredentialEvents(credentialId: string): Promise<CredentialEventRow[]> {
  if (!hasDatabase()) return []
  const { data } = await safe(
    db()
      .from('credential_events')
      .select(`id, action, actor_id, request_id, source, created_at,
        actor:profiles(display_name, full_name)`)
      .eq('credential_id', credentialId)
      .order('created_at', { ascending: true })
      .limit(500),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const actor = asCreator(row.actor)
    return {
      id: row.id as string,
      action: row.action as string,
      actorId: (row.actor_id as string | null) ?? null,
      actorName: actor?.display_name ?? actor?.full_name ?? null,
      requestId: (row.request_id as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }
  })
}

export async function getCredentialById(id: string): Promise<CredentialDetail | null> {
  if (!hasDatabase()) return null
  const { data } = await safe(
    db().from('api_credentials').select(COLUMNS).eq('id', id).maybeSingle(),
  )
  if (!data) return null
  const events = await getCredentialEvents(id)
  const row = toListRow(data as unknown as Record<string, unknown>)
  return {
    ...row,
    events,
    rotation: deriveRotationCycle(events, row.version),
  }
}

/**
 * Cross-credential activity feed for the list screen's audit strip — the newest
 * lifecycle events across every credential, with the credential name joined in.
 */
export async function getRecentCredentialActivity(limit = 8): Promise<
  (CredentialEventRow & { credentialId: string; credentialName: string | null })[]
> {
  if (!hasDatabase()) return []
  const { data } = await safe(
    db()
      .from('credential_events')
      .select(`id, credential_id, action, actor_id, request_id, source, created_at,
        actor:profiles(display_name, full_name),
        credential:api_credentials(name)`)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const actor = asCreator(row.actor)
    const credential = (Array.isArray(row.credential) ? row.credential[0] : row.credential) as
      | { name: string | null }
      | null
      | undefined
    return {
      id: row.id as string,
      credentialId: row.credential_id as string,
      credentialName: credential?.name ?? null,
      action: row.action as string,
      actorId: (row.actor_id as string | null) ?? null,
      actorName: actor?.display_name ?? actor?.full_name ?? null,
      requestId: (row.request_id as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }
  })
}

import 'server-only'

import {
  APPROVAL_COLUMNS,
  approvalUseDeadline,
  isPendingUsable,
  toApprovalRow,
  type ApprovalRow,
  type ApprovalStatus,
} from '@/lib/admin/two-person-control'
import { safe, db } from './shared'

/**
 * Two-person approval queue reads (plan Phase 2.3, spec §44).
 *
 * `status` on the row is the stored lifecycle state; the queue also shows a
 * derived `effectiveStatus` so a pending request whose TTL has passed reads as
 * "expired" without a write. Nothing here exposes secret material — rows carry
 * ids, action keys, and operator prose only (spec §19).
 */

export type ApprovalListRow = ApprovalRow & {
  effectiveStatus: ApprovalStatus
  /** Whether the requester may still execute the action with this approval. */
  usable: boolean
  /** Execution deadline for an approved request (respondedAt + 2h). */
  useDeadline: number | null
}

export function toListRow(row: ApprovalRow): ApprovalListRow {
  const effectiveStatus: ApprovalStatus =
    row.status === 'pending' && !isPendingUsable(row) ? 'expired' : row.status
  const deadline = approvalUseDeadline(row)
  return {
    ...row,
    effectiveStatus,
    usable: row.status === 'approved' && deadline !== null && deadline > Date.now(),
    useDeadline: deadline,
  }
}

export type ApprovalFilters = {
  status?: ApprovalStatus | 'all'
  action?: string
}

export type ApprovalQueue = {
  rows: ApprovalListRow[]
  pending: number
  total: number
}

/** Newest first, capped — the queue is a worklist, not an archive. */
export async function getApprovalsAdmin(filters: ApprovalFilters = {}): Promise<ApprovalQueue> {
  const status = filters.status ?? 'all'
  // `expired` is derived (pending past its TTL), so it filters in JS; every
  // other status filters in SQL.
  let query = db()
    .from('two_person_approvals')
    .select(APPROVAL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)
  if (status !== 'all' && status !== 'expired') query = query.eq('status', status)
  if (filters.action) query = query.eq('action', filters.action)

  const { data, error } = await safe(query)
  if (error || !data) return { rows: [], pending: 0, total: 0 }

  let rows = (data as unknown as Record<string, unknown>[]).map((row) =>
    toListRow(toApprovalRow(row)),
  )
  if (status !== 'all') rows = rows.filter((row) => row.effectiveStatus === status)

  const pendingQuery = await safe(
    db()
      .from('two_person_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString()),
  )

  return { rows, pending: pendingQuery.count ?? 0, total: rows.length }
}

export async function getApprovalById(id: string): Promise<ApprovalListRow | null> {
  const { data, error } = await safe(
    db().from('two_person_approvals').select(APPROVAL_COLUMNS).eq('id', id).maybeSingle(),
  )
  if (error || !data) return null
  return toListRow(toApprovalRow(data as unknown as Record<string, unknown>))
}

/**
 * The live approval for one specific resource, used by gated panels (e.g. the
 * secret revocation card) to show whether the caller has a usable approval.
 */
export async function getApprovalForResource(
  action: string,
  resourceType: string,
  resourceId: string | null | undefined,
  actorId: string,
): Promise<ApprovalListRow | null> {
  let query = db()
    .from('two_person_approvals')
    .select(APPROVAL_COLUMNS)
    .eq('action', action)
    .eq('resource_type', resourceType)
    .eq('actor_id', actorId)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
  query = resourceId ? query.eq('resource_id', resourceId) : query.is('resource_id', null)

  const { data, error } = await safe(query.maybeSingle())
  if (error || !data) return null
  const row = toListRow(toApprovalRow(data as unknown as Record<string, unknown>))
  return row.effectiveStatus === 'pending' || row.usable ? row : null
}

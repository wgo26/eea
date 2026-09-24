import 'server-only'

import { logger } from '@/lib/observability/logger'
import { incidentRef } from '@/lib/platform/state-presentation'
import {
  getStatePrecedence,
  normalizeSeverity,
  resolveActiveStates,
  toSystemState,
  type StateSeverity,
  type SystemState,
} from '@/lib/platform/state-engine'
import { db, hasDatabase, safe } from './shared'

export type { StateSeverity, SystemState }

/* ------------------------------------------------------------------ */
/* System states (spec §27)                                           */
/* ------------------------------------------------------------------ */

/**
 * Live states only, highest precedence first (spec §29) — expired rows drop
 * out here so every consumer agrees on what is actually in effect. The engine
 * owns precedence, so a state added to the DB without a ladder weight sorts
 * last rather than shadowing a critical one.
 */
export async function getActiveStates(): Promise<SystemState[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(db().from('system_states').select('*').eq('active', true))
    const states = ((data ?? []) as unknown as Record<string, unknown>[]).map(toSystemState)
    return resolveActiveStates(states)
  } catch (e) {
    logger.error('admin', 'getActiveStates failed', { error: e })
    return []
  }
}

export async function getStateById(id: string): Promise<SystemState | null> {
  if (!hasDatabase()) return null
  try {
    const { data } = await safe(db().from('system_states').select('*').eq('id', id).maybeSingle())
    return data ? toSystemState(data as unknown as Record<string, unknown>) : null
  } catch (e) {
    logger.error('admin', 'getStateById failed', { error: e })
    return null
  }
}

/**
 * The whole ladder, active or not, highest precedence first — what the
 * operational-controls page (spec §27/§28) lists, so an operator can compare
 * what is live against what is installed.
 */
export async function getAllStates(): Promise<SystemState[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(db().from('system_states').select('*'))
    const states = ((data ?? []) as unknown as Record<string, unknown>[]).map(toSystemState)
    return states.sort((a, b) => getStatePrecedence(b.id) - getStatePrecedence(a.id))
  } catch (e) {
    logger.error('admin', 'getAllStates failed', { error: e })
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Scheduled activation (spec §28)                                    */
/* ------------------------------------------------------------------ */

export type StateScheduleRow = {
  id: string
  stateId: string
  label: string
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  enabled: boolean
  /** 'activated' means the cron lit this state and is responsible for clearing it. */
  lastAction: string | null
  lastRunAt: string | null
}

export async function getStateSchedules(): Promise<StateScheduleRow[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db().from('state_schedules').select('*').order('start_month').order('start_day'),
    )
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      stateId: row.state_id as string,
      label: (row.label as string | null) ?? (row.state_id as string),
      startMonth: Number(row.start_month ?? 1),
      startDay: Number(row.start_day ?? 1),
      endMonth: Number(row.end_month ?? 1),
      endDay: Number(row.end_day ?? 1),
      enabled: Boolean(row.enabled),
      lastAction: (row.last_action as string | null) ?? null,
      lastRunAt: (row.last_run_at as string | null) ?? null,
    }))
  } catch (e) {
    logger.error('admin', 'getStateSchedules failed', { error: e })
    return []
  }
}

export type StateEventRow = {
  id: string
  stateId: string
  action: string
  previousStateId: string | null
  reason: string | null
  actorId: string | null
  actorName: string | null
  createdAt: string | null
}

/** Activation history for one state, newest first (spec §27). */
export async function getStateHistory(stateId: string, limit = 20): Promise<StateEventRow[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('system_state_events')
        .select('id, state_id, action, previous_state_id, reason, actor_id, created_at, actor:profiles(display_name, full_name)')
        .eq('state_id', stateId)
        .order('created_at', { ascending: false })
        .limit(limit),
    )
    return mapStateEvents(data)
  } catch (e) {
    logger.error('admin', 'getStateHistory failed', { error: e })
    return []
  }
}

/**
 * Every transition across the ladder, newest first — the operational-controls
 * page (spec §27) shows one timeline, so an operator can see a scheduled
 * activation, a manual one and an escalation in the order they happened
 * without opening each state in turn.
 */
export async function getRecentStateEvents(limit = 20): Promise<StateEventRow[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('system_state_events')
        .select('id, state_id, action, previous_state_id, reason, actor_id, created_at, actor:profiles(display_name, full_name)')
        .order('created_at', { ascending: false })
        .limit(limit),
    )
    return mapStateEvents(data)
  } catch (e) {
    logger.error('admin', 'getRecentStateEvents failed', { error: e })
    return []
  }
}

function mapStateEvents(data: unknown): StateEventRow[] {
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const actor = (Array.isArray(row.actor) ? row.actor[0] : row.actor) as
      | { display_name: string | null; full_name: string | null }
      | undefined
    return {
      id: row.id as string,
      stateId: row.state_id as string,
      action: row.action as string,
      previousStateId: (row.previous_state_id as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
      actorId: (row.actor_id as string | null) ?? null,
      actorName: actor?.display_name ?? actor?.full_name ?? null,
      createdAt: (row.created_at as string | null) ?? null,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Incidents (spec §39)                                               */
/* ------------------------------------------------------------------ */

export type IncidentStatus =
  | 'investigating'
  | 'identified'
  | 'mitigating'
  | 'monitoring'
  | 'resolved'

const INCIDENT_STATUSES: IncidentStatus[] = [
  'investigating',
  'identified',
  'mitigating',
  'monitoring',
  'resolved',
]

export function normalizeIncidentStatus(value: string | null | undefined): IncidentStatus {
  const v = (value ?? '').toLowerCase()
  return (INCIDENT_STATUSES as string[]).includes(v) ? (v as IncidentStatus) : 'investigating'
}

export function isIncidentOpen(status: string): boolean {
  return normalizeIncidentStatus(status) !== 'resolved'
}

export type TimelineEntry = {
  at: string | null
  note: string
  by: string | null
}

function normalizeTimeline(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const row = entry as Record<string, unknown>
    const note = typeof row.note === 'string' ? row.note : typeof row.message === 'string' ? row.message : null
    if (!note) return []
    return [
      {
        at: typeof row.at === 'string' ? row.at : typeof row.timestamp === 'string' ? row.timestamp : null,
        note,
        by: typeof row.by === 'string' ? row.by : typeof row.actor === 'string' ? row.actor : null,
      },
    ]
  })
}

export type IncidentRow = {
  id: string
  /** Display reference for the spec §26 banner (`INC-2026-1A2B3C`). */
  ref: string
  title: string
  severity: StateSeverity
  description: string | null
  affectedServices: string[]
  startTime: string
  currentStatus: IncidentStatus
  owner: string | null
  publicStatusMessage: string | null
  resolvedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  createdBy: string | null
  creatorName: string | null
  open: boolean
}

export type IncidentDetail = IncidentRow & {
  internalNotes: string | null
  resolutionNotes: string | null
  timeline: TimelineEntry[]
  events: IncidentEventRow[]
}

const INCIDENT_COLUMNS = `id, title, severity, description, affected_services, start_time, current_status,
  incident_owner, public_status_message, resolved_at, created_at, updated_at, created_by,
  creator:profiles(display_name, full_name)`

function mapIncident(row: Record<string, unknown>): IncidentRow {
  const creator = (Array.isArray(row.creator) ? row.creator[0] : row.creator) as
    | { display_name: string | null; full_name: string | null }
    | undefined
  const currentStatus = normalizeIncidentStatus(row.current_status as string | null)
  return {
    id: row.id as string,
    ref: incidentRef(row.id as string, row.created_at as string | null),
    title: row.title as string,
    severity: normalizeSeverity(row.severity as string | null),
    description: (row.description as string | null) ?? null,
    affectedServices: Array.isArray(row.affected_services) ? (row.affected_services as string[]) : [],
    startTime: (row.start_time as string | null) ?? (row.created_at as string) ?? '',
    currentStatus,
    owner: (row.incident_owner as string | null) ?? null,
    publicStatusMessage: (row.public_status_message as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    creatorName: creator?.display_name ?? creator?.full_name ?? null,
    open: currentStatus !== 'resolved',
  }
}

/**
 * Active incidents first, then resolved history (spec §39). `status` filters to
 * one lifecycle value; otherwise every status is returned with open ones on top
 * so the operational list never buries a live incident under old ones.
 */
export async function getIncidents(options?: {
  limit?: number
  page?: number
  status?: string
  severity?: string
}): Promise<{ rows: IncidentRow[]; total: number; openCount: number }> {
  if (!hasDatabase()) return { rows: [], total: 0, openCount: 0 }
  const limit = options?.limit ?? 25
  const page = options?.page ?? 1
  const offset = (page - 1) * limit
  try {
    const openQuery = db()
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .neq('current_status', 'resolved')

    let query = db()
      .from('incidents')
      .select(INCIDENT_COLUMNS, { count: 'exact' })
      .order('resolved_at', { ascending: true, nullsFirst: true })
      .order('start_time', { ascending: false })
      .range(offset, offset + limit - 1)
    if (options?.status && options.status !== 'all') query = query.eq('current_status', options.status)
    if (options?.severity && options.severity !== 'all') query = query.eq('severity', options.severity)

    const [listRes, openRes] = await Promise.all([safe(query), safe(openQuery)])
    return {
      rows: ((listRes.data ?? []) as unknown as Record<string, unknown>[]).map(mapIncident),
      total: listRes.count ?? 0,
      openCount: openRes.count ?? 0,
    }
  } catch (e) {
    logger.error('admin', 'getIncidents failed', { error: e })
    return { rows: [], total: 0, openCount: 0 }
  }
}

/**
 * The incident the critical-mode banner describes (spec §26): most recently
 * started unresolved incident, or null when the platform is clear.
 */
export async function getActiveIncident(): Promise<IncidentRow | null> {
  if (!hasDatabase()) return null
  try {
    const { data } = await safe(
      db()
        .from('incidents')
        .select(INCIDENT_COLUMNS)
        .neq('current_status', 'resolved')
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    return data ? mapIncident(data as unknown as Record<string, unknown>) : null
  } catch (e) {
    logger.error('admin', 'getActiveIncident failed', { error: e })
    return null
  }
}

export type IncidentEventRow = {
  id: string
  incidentId: string
  fromStatus: IncidentStatus | null
  toStatus: IncidentStatus | null
  note: string | null
  actorId: string | null
  actorName: string | null
  createdAt: string | null
}

/** Full incident detail — internal notes, timeline entries and every status transition. */
export async function getIncidentById(id: string): Promise<IncidentDetail | null> {
  if (!hasDatabase()) return null
  try {
    const [incidentRes, eventsRes] = await Promise.all([
      safe(
        db()
          .from('incidents')
          .select(`${INCIDENT_COLUMNS}, internal_notes, resolution_notes, timeline`)
          .eq('id', id)
          .maybeSingle(),
      ),
      safe(
        db()
          .from('incident_events')
          .select('id, incident_id, from_status, to_status, note, actor_id, created_at, actor:profiles(display_name, full_name)')
          .eq('incident_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
      ),
    ])
    if (!incidentRes.data) return null
    const row = incidentRes.data as unknown as Record<string, unknown>
    const events: IncidentEventRow[] = ((eventsRes.data ?? []) as unknown as Record<string, unknown>[]).map((e) => {
      const actor = (Array.isArray(e.actor) ? e.actor[0] : e.actor) as
        | { display_name: string | null; full_name: string | null }
        | undefined
      return {
        id: e.id as string,
        incidentId: e.incident_id as string,
        fromStatus: e.from_status ? normalizeIncidentStatus(e.from_status as string) : null,
        toStatus: e.to_status ? normalizeIncidentStatus(e.to_status as string) : null,
        note: (e.note as string | null) ?? null,
        actorId: (e.actor_id as string | null) ?? null,
        actorName: actor?.display_name ?? actor?.full_name ?? null,
        createdAt: (e.created_at as string | null) ?? null,
      }
    })
    return {
      ...mapIncident(row),
      internalNotes: (row.internal_notes as string | null) ?? null,
      resolutionNotes: (row.resolution_notes as string | null) ?? null,
      timeline: normalizeTimeline(row.timeline),
      events,
    }
  } catch (e) {
    logger.error('admin', 'getIncidentById failed', { error: e })
    return null
  }
}

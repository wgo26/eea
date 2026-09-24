import 'server-only'

import { createAdminClient, type InsertOf, type UpdateOf } from '@/lib/supabase/admin'

/**
 * State-mutation primitives (spec §27).
 *
 * Both writers of the state ladder — the operational controls
 * (`lib/admin/actions/states.ts`) and the incident console
 * (`lib/admin/actions/incidents.ts`) — go through here, so "turn a state on"
 * means exactly one row update plus exactly one history entry, whichever
 * surface asked. Plain module (no `'use server'`): these are not actions and
 * must not become callable endpoints.
 *
 * Every write uses the service-role client — `system_states` and
 * `system_state_events` are SELECT-only under RLS.
 */

export type AdminDb = ReturnType<typeof createAdminClient>

export type StateEventAction = 'activated' | 'deactivated' | 'restored' | 'escalated'

export type StateWriteResult = { ok: true } | { ok: false; error: string }

/**
 * Flips the activation columns. `expiresAt` is passed only when the caller
 * wants a hard cutoff (a state with `defaultDurationHours`); null means the
 * state stays lit until something deactivates it.
 */
export async function setStateActive(
  admin: AdminDb,
  stateId: string,
  active: boolean,
  actorId: string | null,
  options?: { expiresAt?: string | null },
): Promise<StateWriteResult> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('system_states')
    .update({
      active,
      activated_at: active ? now : null,
      activated_by: active ? actorId : null,
      expires_at: active ? options?.expiresAt ?? null : null,
      updated_at: now,
    } as UpdateOf<'system_states'>)
    .eq('id', stateId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Appends to the activation history (spec §27). `previousStateId` is the state
 * that was effective beforehand, so the ladder can be reconstructed from the
 * log alone — it is what an incident release reads to know where to return.
 */
export async function logStateEvent(
  admin: AdminDb,
  entry: {
    stateId: string
    action: StateEventAction
    previousStateId: string | null
    reason: string
    actorId: string | null
  },
): Promise<void> {
  await admin.from('system_state_events').insert({
    state_id: entry.stateId,
    action: entry.action,
    previous_state_id: entry.previousStateId,
    reason: entry.reason,
    actor_id: entry.actorId,
  } as InsertOf<'system_state_events'>)
}

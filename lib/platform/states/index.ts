/**
 * State plugin manifests (plan Phase 6.1, spec §63–§64).
 *
 * One module per state, assembled here. Layouts, cron passes and admin pages
 * call `ensurePluginStatesRegistered()` once per request instead of importing
 * each manifest — adding a future state means adding its file and one line
 * in `PLUGIN_STATES` below, never touching components or the engine.
 */

import 'server-only'

import { BACK_TO_SCHOOL_STATE } from '../back-to-school'
import { ensureStateRegistered, type SystemStateConfig } from '../state-registry'
import { ELECTION_PERIOD_STATE } from './election-period'
import { HOLIDAY_STATE } from './holiday'

export { ELECTION_PERIOD_STATE } from './election-period'
export { HOLIDAY_STATE } from './holiday'

/** Every plugin state the platform ships, in registration order. */
export const PLUGIN_STATES: SystemStateConfig[] = [BACK_TO_SCHOOL_STATE, ELECTION_PERIOD_STATE, HOLIDAY_STATE]

/** Idempotent install of all plugin manifests (spec §64). */
export function ensurePluginStatesRegistered(): void {
  for (const state of PLUGIN_STATES) {
    const verdict = ensureStateRegistered(state)
    if (!verdict.ok) console.error(`[platform] state registration failed for ${state.id}: ${verdict.error}`)
  }
}

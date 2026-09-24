/**
 * Plugin-state registration API (plan Phase 6.1, spec §63–§64).
 *
 * Canonical import surface for registering contextual states: the registry
 * itself lives in `./state-engine` (pure, unit-tested, single source of
 * truth); this module documents the plugin contract and re-exports it so new
 * states never touch the engine file. A new state ships three things:
 *
 *   1. a config module under `lib/platform/states/` exporting a
 *      `SystemStateConfig` (see `election-period.ts` / `holiday.ts`),
 *   2. a `registerSystemState(CONFIG)` call (idempotent — duplicates report
 *      instead of throwing, so layout + cron passes can both ensure it),
 *   3. runtime/seed rows in `system_states` when the state needs DB presence.
 *
 * Server-only: states resolve tokens that feed CSS injection in layouts.
 */

import 'server-only'

import {
  getRegisteredStates,
  getSystemStateConfig,
  isRegisteredState,
  registerSystemState,
  type SystemStateConfig,
} from './state-engine'

export { getRegisteredStates, getSystemStateConfig, isRegisteredState, registerSystemState }
export type { SystemStateConfig }

/**
 * Documented shape of a state plugin manifest (spec §64): metadata, visual
 * profile, behaviour, content priorities and activation/expiration rules.
 * `defineState` is an identity helper — it exists so manifests read as
 * declarations and get full type-checking at the declaration site.
 */
export function defineState(config: SystemStateConfig): SystemStateConfig {
  return config
}

/**
 * Install a plugin state, tolerating repeat calls across request passes.
 * Returns the engine verdict so callers can surface genuine misconfiguration
 * (bad id, unknown visual profile) while ignoring already-registered.
 */
export function ensureStateRegistered(config: SystemStateConfig): { ok: true } | { ok: false; error: string } {
  if (isRegisteredState(config.id)) return { ok: true }
  return registerSystemState(config)
}

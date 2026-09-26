import 'server-only'

import { BACK_TO_SCHOOL_STATE } from './back-to-school'

/**
 * System-state engine (spec §20–§33).
 *
 * A system state is configuration, never hard-coded conditional styling: the
 * engine maps a recognized platform context (NORMAL, SEASONAL, HIGH_ACTIVITY,
 * MAINTENANCE, DEGRADED, RECOVERY, INCIDENT, CRITICAL) to semantic token
 * overrides, component behaviour, notification behaviour and accessibility
 * behaviour. The admin layout resolves the effective state once per request
 * and injects the tokens as CSS custom properties, so every component picks
 * the state up through the existing design system.
 *
 * Pure by design (no DB access) so precedence and token resolution are
 * unit-testable; `lib/admin/queries/states.ts` owns the reads and
 * `lib/admin/actions/states.ts` the activation writes.
 *
 * Spec §63/§64 — states are *registered*, not enumerated: `registerSystemState`
 * installs a plugin-style config (metadata, visual profile, behaviour,
 * content priorities, activation/expiration rules) and every resolver below
 * reads the registry, so a new state needs no change to components.
 */

export type StateSeverity = 'normal' | 'info' | 'warning' | 'critical'

export type StateBehaviorProfile = {
  navigation?: string
  notifications?: string
  contentPriority?: string
  motion?: string
}

/** Mirrors the spec §27 interface (DB naming is snake_case, this isn't). */
export interface SystemState {
  id: string
  name: string
  severity: StateSeverity
  active: boolean
  visualProfile: string
  affectedModules: string[]
  behaviorProfile: StateBehaviorProfile
  accessibilityProfile: string
  activatedAt?: string | null
  activatedBy?: string | null
  expiresAt?: string | null
}

export const NORMAL_STATE_ID = 'NORMAL'

/* ------------------------------------------------------------------ */
/* Visual profiles (spec §25/§30)                                     */
/* ------------------------------------------------------------------ */

export type StateTone = 'normal' | 'info' | 'warning' | 'critical'

export type StateVisualProfile = {
  /** Semantic-token overrides, applied as CSS custom properties. */
  tokens: Record<string, string>
  tone: StateTone
  /** Spec §25 — critical mode reduces nonessential animation. */
  reduceMotion: boolean
  /** Explicit accessible status line (spec §21/§33). */
  statusLabel: string
}

const VISUAL_PROFILES: Record<string, StateVisualProfile> = {
  default: {
    tokens: {},
    tone: 'normal',
    reduceMotion: false,
    statusLabel: 'Normal operations',
  },
  seasonal: {
    tokens: {
      '--accent': 'oklch(0.96 0.03 75)',
      '--secondary': 'oklch(0.97 0.02 75)',
    },
    tone: 'info',
    reduceMotion: false,
    statusLabel: 'Seasonal mode active',
  },
  'education-season': {
    // Spec §22 — fresh but controlled: a single cool accent, denser surfaces
    // lead with structure rather than decoration. Never childish.
    tokens: {
      '--accent': 'oklch(0.95 0.04 155)',
      '--secondary': 'oklch(0.97 0.02 155)',
      '--ring': 'oklch(0.68 0.13 155)',
    },
    tone: 'info',
    reduceMotion: false,
    statusLabel: 'Back to School season active',
  },
  'high-activity': {
    tokens: {
      '--accent': 'oklch(0.95 0.05 85)',
      '--ring': 'oklch(0.7 0.15 85)',
    },
    tone: 'info',
    reduceMotion: false,
    statusLabel: 'High activity period',
  },
  maintenance: {
    tokens: {
      '--primary': 'oklch(0.62 0.05 250)',
      '--ring': 'oklch(0.6 0.06 250)',
      '--radius': '0.375rem',
    },
    tone: 'warning',
    reduceMotion: true,
    statusLabel: 'Maintenance mode active',
  },
  degraded: {
    tokens: {
      '--primary': 'oklch(0.72 0.14 65)',
      '--ring': 'oklch(0.68 0.15 65)',
      '--border': 'oklch(0.86 0.05 65)',
    },
    tone: 'warning',
    reduceMotion: true,
    statusLabel: 'Service degraded',
  },
  recovery: {
    tokens: {
      '--accent': 'oklch(0.95 0.06 165)',
      '--ring': 'oklch(0.68 0.12 165)',
    },
    tone: 'info',
    reduceMotion: false,
    statusLabel: 'Recovery in progress',
  },
  incident: {
    tokens: {
      '--primary': 'oklch(0.62 0.19 35)',
      '--ring': 'oklch(0.6 0.2 30)',
      '--border': 'oklch(0.86 0.06 30)',
    },
    tone: 'critical',
    reduceMotion: true,
    statusLabel: 'Incident active',
  },
  critical: {
    // Spec §25 — higher contrast, reduced decoration, no decorative motion.
    tokens: {
      '--primary': 'oklch(0.55 0.22 27)',
      '--primary-foreground': 'oklch(0.99 0 0)',
      '--ring': 'oklch(0.55 0.22 27)',
      '--border': 'oklch(0.72 0.12 27)',
      '--muted-foreground': 'oklch(0.42 0 0)',
      '--radius': '0.25rem',
    },
    tone: 'critical',
    reduceMotion: true,
    statusLabel: 'Critical platform state',
  },
}

/* ------------------------------------------------------------------ */
/* Plugin-style registry (spec §63/§64)                                */
/* ------------------------------------------------------------------ */

/** Spec §28 — the four ways a state may be entered. */
export type StateActivationRules = {
  manual: boolean
  scheduled: boolean
  automated: boolean
  incident: boolean
}

/**
 * What a state must declare to be installable (spec §63). `visualProfile`
 * names a shared profile; supply `visual` inline to ship a state-private one.
 */
export type SystemStateConfig = {
  id: string
  name: string
  severity: StateSeverity
  /** Spec §29 ladder weight — higher wins when several states are live. */
  precedence: number
  visualProfile: string
  /** Inline profile for a plugin state that ships its own token set. */
  visual?: StateVisualProfile
  /** Defaults for the four §27 behaviour axes; DB rows may override. */
  behavior?: StateBehaviorProfile
  accessibilityProfile?: string
  affectedModules?: string[]
  /** Spec §23 — categories the dashboard should surface while active. */
  contentPriorities?: string[]
  activation?: Partial<StateActivationRules>
  /** Spec §64 — default expiry in hours for a manual activation; null = until deactivated. */
  defaultDurationHours?: number | null
}

const STATE_ID_RE = /^[A-Z][A-Z0-9_]{1,39}$/

const REGISTRY = new Map<string, SystemStateConfig>()

export function getSystemStateConfig(stateId: string): SystemStateConfig | undefined {
  return REGISTRY.get(stateId.trim().toUpperCase())
}

export function isRegisteredState(stateId: string): boolean {
  return REGISTRY.has(stateId.trim().toUpperCase())
}

/** Every installed state, highest precedence first (spec §29). */
export function getRegisteredStates(): SystemStateConfig[] {
  return [...REGISTRY.values()].sort((a, b) => b.precedence - a.precedence)
}

/**
 * Spec §64 — installs a state without touching the design system. Rejects a
 * duplicate id (two plugins cannot own one state) and a visual profile that
 * resolves to nothing, so a typo fails at registration instead of silently
 * rendering the default tokens.
 */
export function registerSystemState(
  config: SystemStateConfig,
): { ok: true } | { ok: false; error: string } {
  const id = config.id?.trim().toUpperCase() ?? ''
  if (!STATE_ID_RE.test(id)) {
    return { ok: false, error: `Invalid system state id: "${config.id}"` }
  }
  if (REGISTRY.has(id)) {
    return { ok: false, error: `System state already registered: ${id}` }
  }
  if (!Number.isFinite(config.precedence)) {
    return { ok: false, error: `System state ${id} needs a numeric precedence.` }
  }
  if (!config.visual && !(config.visualProfile in VISUAL_PROFILES)) {
    return { ok: false, error: `Unknown visual profile for ${id}: "${config.visualProfile}"` }
  }
  REGISTRY.set(id, { ...config, id })
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Built-in states (spec §20)                                          */
/* ------------------------------------------------------------------ */

/**
 * The eight states the spec names, as registry entries. NORMAL is precedence
 * 0 and the synthetic fallback; every other state must outrank it. INCIDENT/
 * CRITICAL declare `incident: true` because the incident console activates
 * them (spec §28), and the telemetry-driven states declare `automated: true`.
 */
const BUILT_IN_STATES: SystemStateConfig[] = [
  {
    id: 'NORMAL',
    name: 'Normal operations',
    severity: 'normal',
    precedence: 0,
    visualProfile: 'default',
    activation: { manual: true },
  },
  {
    id: 'SEASONAL',
    name: 'Seasonal mode',
    severity: 'info',
    precedence: 10,
    visualProfile: 'seasonal',
    behavior: { contentPriority: 'seasonal' },
    activation: { manual: true, scheduled: true },
  },
  {
    id: 'HIGH_ACTIVITY',
    name: 'High activity',
    severity: 'info',
    precedence: 20,
    visualProfile: 'high-activity',
    behavior: { navigation: 'condensed', notifications: 'elevated', contentPriority: 'high-traffic' },
    activation: { manual: true, scheduled: true, automated: true },
    defaultDurationHours: 24,
  },
  {
    id: 'MAINTENANCE',
    name: 'Maintenance mode',
    severity: 'warning',
    precedence: 30,
    visualProfile: 'maintenance',
    behavior: { navigation: 'condensed', notifications: 'elevated', motion: 'reduced' },
    activation: { manual: true, scheduled: true },
    defaultDurationHours: 24,
  },
  {
    id: 'DEGRADED',
    name: 'Service degraded',
    severity: 'warning',
    precedence: 40,
    visualProfile: 'degraded',
    behavior: { notifications: 'elevated', motion: 'reduced' },
    activation: { manual: true, automated: true },
  },
  {
    // Spec §29 — recovery supersedes the degraded presentation but stays
    // below an active incident.
    id: 'RECOVERY',
    name: 'Recovery in progress',
    severity: 'info',
    precedence: 45,
    visualProfile: 'recovery',
    behavior: { notifications: 'elevated' },
    activation: { manual: true, automated: true },
  },
  {
    id: 'INCIDENT',
    name: 'Incident active',
    severity: 'warning',
    precedence: 50,
    visualProfile: 'incident',
    behavior: { navigation: 'condensed', notifications: 'prominent', contentPriority: 'incident-first', motion: 'reduced' },
    activation: { manual: true, incident: true },
  },
  {
    id: 'CRITICAL',
    name: 'Critical platform state',
    severity: 'critical',
    precedence: 60,
    visualProfile: 'critical',
    behavior: { navigation: 'condensed', notifications: 'prominent', contentPriority: 'incident-first', motion: 'reduced' },
    activation: { manual: true, incident: true, automated: true },
  },
]

/**
 * Registration pass. The eight ladder states plus every plugin state that
 * ships with the platform (`BACK_TO_SCHOOL`, spec §22/§64) — the engine itself
 * only ever renders what the registry resolves, so a third-party state added
 * here appears in the ladder, the behaviour resolver and the activation gate
 * with no further wiring.
 */
for (const config of [...BUILT_IN_STATES, BACK_TO_SCHOOL_STATE]) registerSystemState(config)

/**
 * Spec §29 — the built-in ladder. Plugins add their own weight via
 * `registerSystemState`; `getStatePrecedence` reads the registry, so this map
 * is the shipped baseline rather than the full ordering.
 */
export const STATE_PRECEDENCE: Record<string, number> = Object.fromEntries(
  BUILT_IN_STATES.map((config) => [config.id, config.precedence]),
)

export function getStatePrecedence(stateId: string): number {
  return getSystemStateConfig(stateId)?.precedence ?? 0
}

/* ------------------------------------------------------------------ */
/* Row normalization and resolution                                   */
/* ------------------------------------------------------------------ */

const SEVERITIES: StateSeverity[] = ['normal', 'info', 'warning', 'critical']

export function normalizeSeverity(value: string | null | undefined): StateSeverity {
  const v = (value ?? '').toLowerCase()
  return (SEVERITIES as string[]).includes(v) ? (v as StateSeverity) : 'normal'
}

function normalizeBehaviorProfile(value: unknown): StateBehaviorProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const row = value as Record<string, unknown>
  const pick = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : undefined)
  return {
    navigation: pick('navigation'),
    notifications: pick('notifications'),
    contentPriority: pick('contentPriority'),
    motion: pick('motion'),
  }
}

/** Narrow a `system_states` row (generated as loose strings) into SystemState. */
export function toSystemState(row: Record<string, unknown>): SystemState {
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? (row.id as string),
    severity: normalizeSeverity(row.severity as string | null),
    active: Boolean(row.active),
    visualProfile: (row.visual_profile as string | null) ?? 'default',
    affectedModules: Array.isArray(row.affected_modules) ? (row.affected_modules as string[]) : [],
    behaviorProfile: normalizeBehaviorProfile(row.behavior_profile),
    accessibilityProfile: (row.accessibility_profile as string | null) ?? 'standard',
    activatedAt: (row.activated_at as string | null) ?? null,
    activatedBy: (row.activated_by as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

/**
 * The synthetic NORMAL state — used when nothing is active (or the DB is
 * unreachable) so the caller always has a state to render. Spec §21:
 * atmosphere never replaces information, so NORMAL carries no token
 * overrides and an explicit status label.
 */
export const NORMAL_STATE: SystemState = {
  id: NORMAL_STATE_ID,
  name: (getSystemStateConfig(NORMAL_STATE_ID)?.name ?? 'Normal operations'),
  severity: 'normal',
  active: true,
  visualProfile: 'default',
  affectedModules: [],
  behaviorProfile: {},
  accessibilityProfile: 'standard',
  activatedAt: null,
  activatedBy: null,
  expiresAt: null,
}

/** Expired states drop out of resolution — `expires_at` is a hard cutoff. */
export function isStateLive(state: SystemState, now: Date = new Date()): boolean {
  if (!state.active) return false
  if (!state.expiresAt) return true
  const expires = Date.parse(state.expiresAt)
  return Number.isNaN(expires) ? true : expires > now.getTime()
}

/** All live states, highest precedence first (spec §29). */
export function resolveActiveStates(
  states: SystemState[],
  now: Date = new Date(),
): SystemState[] {
  return states
    .filter((state) => isStateLive(state, now))
    .sort((a, b) => getStatePrecedence(b.id) - getStatePrecedence(a.id))
}

/** The state that drives presentation: top-precedence live state, else NORMAL. */
export function getEffectiveState(states: SystemState[], now: Date = new Date()): SystemState {
  return resolveActiveStates(states, now)[0] ?? NORMAL_STATE
}

/* ------------------------------------------------------------------ */
/* Visual profile + behaviour resolution                              */
/* ------------------------------------------------------------------ */

function profileFor(stateId: string): StateVisualProfile {
  const config = getSystemStateConfig(stateId)
  if (!config) return VISUAL_PROFILES.default
  return config.visual ?? VISUAL_PROFILES[config.visualProfile] ?? VISUAL_PROFILES.default
}

export function getStateVisualProfile(stateId: string): StateVisualProfile {
  return profileFor(stateId)
}

/** Serialize a profile's tokens for `style={{ ... }}` on a server component. */
export function stateTokenStyle(stateId: string): Record<string, string> {
  return { ...profileFor(stateId).tokens }
}

/**
 * Resolved behaviour for a state (spec §20.3–§20.6, §27). `overrides` is the
 * row's `behavior_profile`, so a DB tuning wins over the registered default
 * while unset axes fall back to severity-appropriate values.
 */
export type ResolvedStateBehavior = {
  stateId: string
  severity: StateSeverity
  tone: StateTone
  statusLabel: string
  reduceMotion: boolean
  accessibilityProfile: string
  affectedModules: string[]
  /** Spec §23 — categories to surface while this state is active. */
  contentPriorities: string[]
  activation: StateActivationRules
  defaultDurationHours: number | null
  /** §27 axes, resolved to a concrete rule name (never undefined). */
  navigation: string
  notifications: string
  contentPriority: string
  motion: string
}

const NO_ACTIVATION: StateActivationRules = {
  manual: false,
  scheduled: false,
  automated: false,
  incident: false,
}

function defaultNotifications(severity: StateSeverity): string {
  if (severity === 'critical') return 'prominent'
  if (severity === 'warning') return 'elevated'
  return 'standard'
}

export function getStateBehavior(
  stateId: string,
  overrides?: StateBehaviorProfile,
): ResolvedStateBehavior {
  const config = getSystemStateConfig(stateId)
  const profile = profileFor(stateId)
  const severity = config?.severity ?? 'normal'
  const merged: StateBehaviorProfile = { ...config?.behavior, ...overrides }
  const motion = merged.motion ?? (profile.reduceMotion ? 'reduced' : 'standard')

  return {
    stateId: config?.id ?? stateId.toUpperCase(),
    severity,
    tone: profile.tone,
    statusLabel: profile.statusLabel,
    reduceMotion: profile.reduceMotion || motion === 'reduced',
    accessibilityProfile: config?.accessibilityProfile ?? 'standard',
    affectedModules: config?.affectedModules ?? [],
    contentPriorities: config?.contentPriorities ?? [],
    activation: { ...NO_ACTIVATION, ...config?.activation },
    defaultDurationHours: config?.defaultDurationHours ?? null,
    navigation: merged.navigation ?? 'standard',
    notifications: merged.notifications ?? defaultNotifications(severity),
    contentPriority: merged.contentPriority ?? 'standard',
    motion,
  }
}

/* ------------------------------------------------------------------ */
/* Activation gate                                                    */
/* ------------------------------------------------------------------ */

/**
 * Spec §28 — only the chief administrator may activate or deactivate a
 * state. The caller passes the result of a capability check so this module
 * stays dependency-free; every activation surface (actions module) asserts
 * the same capability server-side.
 */
export function canActivateState(params: {
  allowed: boolean
  stateId: string
  /** An active incident outranks every manually activated state. */
  hasActiveIncident?: boolean
}): { ok: true } | { ok: false; error: string } {
  if (!params.allowed) {
    return { ok: false, error: 'You do not have permission to change the system state.' }
  }
  if (params.stateId === NORMAL_STATE_ID && params.hasActiveIncident) {
    return {
      ok: false,
      error: 'An incident is still open — resolve it before returning to normal operations.',
    }
  }
  if (!isRegisteredState(params.stateId)) {
    return { ok: false, error: `Unknown system state: ${params.stateId}` }
  }
  return { ok: true }
}

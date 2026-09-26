import type { AppRole } from './types'

/**
 * Capability map (checklist item 5) — the role → permission matrix that drives
 * menu visibility AND route guards. Roles never appear as hardcoded booleans
 * in components; UI asks for capabilities, not roles.
 *
 * "member" is an authenticated user with NO rows in user_roles (the implicit
 * model, now documented): members have zero admin capabilities and never see
 * app chrome beyond their account dashboard.
 */
export type Capability =
  | 'viewDashboard'
  | 'moderate'
  | 'manageContent'
  | 'managePolls'
  | 'manageFundraisers'
  | 'managePolicies'
  | 'manageSiteContent'
  | 'manageUsers'
  | 'manageAds'
  | 'manageNotifications'
  // Phase 1.2 — platform states + incidents (spec §24–§39).
  | 'system.configure'
  | 'incidents.manage'
  | 'branding.publish'
  // Phase 2.1 — security, analytics and the granular content/admin domains
  // (spec §17–§18). Names match the plan so role mappings read verbatim.
   | 'secrets.create'
   | 'secrets.rotate'
   | 'secrets.revoke'
   | 'secrets.manage'
   // Phase 2.2 — supreme system tier (spec §17 addendum). These two
   // capabilities are NEVER granted to the legacy `admin` map below: they
   // belong exclusively to the `chief_admin` fine-grained role, so the five
   // System & Infrastructure tabs (states, secrets, storage, audit, security)
   // stay invisible — and unreachable — to every other administrator.
   // `system.owner` gates the whole tier; `secrets.reveal` gates the
   // one-time plaintext reveal inside it.
   | 'system.owner'
   | 'secrets.reveal'
   | 'analytics.read'
  | 'listings.manage'
  | 'media.manage'

const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  admin: [
    'viewDashboard',
    'moderate',
    'manageContent',
    'managePolls',
    'manageFundraisers',
    'managePolicies',
    'manageSiteContent',
    'manageUsers',
    'manageAds',
    'manageNotifications',
    'system.configure',
    'incidents.manage',
    'branding.publish',
    'secrets.create',
    'secrets.rotate',
    'secrets.revoke',
    'secrets.manage',
    'analytics.read',
    'listings.manage',
    'media.manage',
  ],
  editor: ['viewDashboard', 'moderate', 'manageContent', 'managePolls', 'manageFundraisers', 'managePolicies', 'manageSiteContent', 'manageNotifications'],
  // Contributor/advertiser capabilities are scoped to their own rows by RLS
  // and queries — they grant no admin-area access.
  contributor: [],
  advertiser: [],
}

const CAPABILITY_WEIGHT: Record<Capability, number> = {
  viewDashboard: 2,
  moderate: 3,
  manageContent: 4,
  managePolls: 5,
  manageFundraisers: 6,
  managePolicies: 7,
  manageSiteContent: 8,
  manageAds: 9,
  manageNotifications: 11,
  manageUsers: 12,
  'analytics.read': 13,
  'listings.manage': 14,
  'media.manage': 15,
  'incidents.manage': 16,
  'system.configure': 17,
  'branding.publish': 18,
  'secrets.create': 20,
  'secrets.rotate': 21,
  'secrets.revoke': 22,
  'secrets.manage': 23,
  // Appended (never renumbered) so existing menu/badge order is stable.
  'system.owner': 24,
  'secrets.reveal': 25,
}

/**
 * RETIRED WEIGHTS — 1 (`viewAuditLog`), 10 (`manageStorage`) and 19
 * (`secrets.read_metadata`) are deliberately left unused rather than reused.
 *
 * All three were dead: they appeared in the type, the legacy `admin` grant list
 * and this table, but gated nothing anywhere in the app, in SQL, or in the nav
 * (proven by the `every capability gates something real` rule in
 * lib/admin/nav-integrity.test.ts). `viewAuditLog` outlived its own guard when
 * the five System & Infrastructure tabs moved behind `system.owner`;
 * `manageStorage` and `secrets.read_metadata` were never wired to a surface —
 * the storage and credentials screens are guarded by `system.owner` directly.
 *
 * Deleting rather than wiring them up is the security-preserving choice: the
 * legacy `admin` map grants all three, so giving either of the storage/secrets
 * names a real guard would have handed every legacy admin access to tabs that
 * docs/system/chief-access.md states must "stay invisible — and unreachable —
 * to every other administrator". Wiring them expands access; deleting them
 * removes a name that falsely reads as an authority.
 *
 * The numbers stay unassigned on purpose. A weight is only a menu/badge sort
 * key, so reuse would silently re-rank an unrelated entry; appending new names
 * past 25 is the rule this file has followed since `system.owner`. The retired
 * weights are 1, 10 and 19 — gaps a reader may notice, which is why they are
 * named here rather than left as a mystery.
 */

/**
 * Every capability in weight order. `Capability` is exactly the key set of
 * CAPABILITY_WEIGHT (a `Record<Capability, number>`), so this stays complete
 * by construction — spec §17 role maps derive their "everything except X"
 * lists from it instead of hardcoding near-complete duplicates.
 */
export const ALL_CAPABILITIES: Capability[] = Object.keys(CAPABILITY_WEIGHT) as Capability[]

/** Union of all capabilities granted by the user's roles. */
export function capabilitiesFor(roles: AppRole[]): Set<Capability> {
  const caps = new Set<Capability>()
  for (const role of roles) {
    for (const cap of ROLE_CAPABILITIES[role] ?? []) caps.add(cap)
  }
  return caps
}

export function hasCapability(roles: AppRole[], capability: Capability): boolean {
  return capabilitiesFor(roles).has(capability)
}

/** Stable ordering for menus/badges built from capabilities. */
export function compareCapabilities(a: Capability, b: Capability): number {
  return CAPABILITY_WEIGHT[a] - CAPABILITY_WEIGHT[b]
}
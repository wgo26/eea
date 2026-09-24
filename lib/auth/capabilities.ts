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
  | 'manageStorage'
  | 'manageNotifications'
  | 'viewAuditLog'
  // Phase 1.2 — platform states + incidents (spec §24–§39).
  | 'system.configure'
  | 'incidents.manage'
  | 'branding.publish'
  // Phase 2.1 — security, analytics and the granular content/admin domains
  // (spec §17–§18). Names match the plan so role mappings read verbatim.
  | 'secrets.read_metadata'
  | 'secrets.create'
  | 'secrets.rotate'
  | 'secrets.revoke'
  | 'secrets.manage'
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
    'manageStorage',
    'manageNotifications',
    'viewAuditLog',
    'system.configure',
    'incidents.manage',
    'branding.publish',
    'secrets.read_metadata',
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
  viewAuditLog: 1,
  viewDashboard: 2,
  moderate: 3,
  manageContent: 4,
  managePolls: 5,
  manageFundraisers: 6,
  managePolicies: 7,
  manageSiteContent: 8,
  manageAds: 9,
  manageStorage: 10,
  manageNotifications: 11,
  manageUsers: 12,
  'analytics.read': 13,
  'listings.manage': 14,
  'media.manage': 15,
  'incidents.manage': 16,
  'system.configure': 17,
  'branding.publish': 18,
  'secrets.read_metadata': 19,
  'secrets.create': 20,
  'secrets.rotate': 21,
  'secrets.revoke': 22,
  'secrets.manage': 23,
}

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
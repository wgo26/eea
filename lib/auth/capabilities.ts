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
  | 'viewAuditLog'

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
    'viewAuditLog',
  ],
  editor: ['viewDashboard', 'moderate', 'manageContent', 'managePolls', 'manageFundraisers', 'managePolicies', 'manageSiteContent'],
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
  manageUsers: 11,
}

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
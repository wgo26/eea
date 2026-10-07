import type { AppRole } from './types'
import { ALL_CAPABILITIES, capabilitiesFor, type Capability } from './capabilities'

/**
 * Spec §17 admin role model (plan Phase 2.1).
 *
 * Two layers, deliberately separate:
 *   • `user_roles.role` — the legacy `app_role` enum (admin/editor/
 *     contributor/advertiser). It is the COARSE gate: whether someone is
 *     staff at all (requireStaff / assertStaff) and whether they reach the
 *     admin area.
 *   • These admin roles — the FINE-GRAINED layer, stored per user in
 *     `user_admin_roles` (text, so the set grows without an enum migration)
 *     and resolved to capabilities. Guards ask for capabilities, never role
 *     names (spec §17: "Permissions should ultimately be capability-based
 *     rather than relying exclusively on role names").
 *
 * `member` is intentionally not a role here: a member is an authenticated
 * user with no `user_roles` rows — the implicit model documented in
 * lib/auth/capabilities.ts.
 *
 * Alias rule (spec §17: Super Administrator = "Full platform control"):
 * `super_admin` is the admin-role name for the legacy `admin`. A legacy admin
 * with no explicit `user_admin_roles` rows is treated as super_admin by
 * `resolveAdminRoles()`, so the new fine-grained layer never locks out the
 * staff the coarse gate already trusts.
 */
export type AdminRole =
  | 'chief_admin'
  | 'super_admin'
  | 'platform_admin'
  | 'editorial_admin'
  | 'senior_editor'
  | 'moderator'
  | 'marketplace_admin'
  | 'media_admin'
  | 'analyst'
  | 'support_operator'

export const ALL_ADMIN_ROLES: AdminRole[] = [
  'chief_admin',
  'super_admin',
  'platform_admin',
  'editorial_admin',
  'senior_editor',
  'moderator',
  'marketplace_admin',
  'media_admin',
  'analyst',
  'support_operator',
]

/** Human-readable names (spec §17 headings) for admin UI badges/selects. */
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  chief_admin: 'Chief Administrator',
  super_admin: 'Super Administrator',
  platform_admin: 'Platform Administrator',
  editorial_admin: 'Editorial Administrator',
  senior_editor: 'Senior Editor',
  moderator: 'Moderator',
  marketplace_admin: 'Marketplace Administrator',
  media_admin: 'Media Administrator',
  analyst: 'Analyst',
  support_operator: 'Support / Operator',
}

export function isAdminRole(value: string | null | undefined): value is AdminRole {
  return !!value && (ALL_ADMIN_ROLES as string[]).includes(value)
}

/* ------------------------------------------------------------------ */
/* Authority tiers — how a set of roles is DISPLAYED, not what it GRANTS */
/* ------------------------------------------------------------------ */

/**
 * The four rungs the shell shows a staff member. This exists because
 * `user_admin_roles` is a SET: someone can hold three roles at once, and the
 * topbar still has to answer "who am I" in one badge. Before this, the identity
 * chip derived that from the LEGACY `app_role` enum only (admin / editor /
 * nothing), so it printed "Member" at a Chief Administrator, a Platform
 * Administrator and an Analyst alike.
 *
 * Deliberately NOT a permission model. No check may consult `ADMIN_ROLE_TIER`:
 * guards ask for capabilities (`requireCapability` / `assertCapability`), which
 * is the contract in lib/auth/capabilities.ts and docs/system/chief-access.md.
 * Tiers are a presentation ranking, kept apart from authorization on purpose so
 * that re-ranking a badge can never quietly change who can do what.
 */
export type AdminRoleTier = 'supreme' | 'executive' | 'operational' | 'analytical'

export const ADMIN_ROLE_TIER: Record<AdminRole, AdminRoleTier> = {
  // Holds `system.owner` + `secrets.reveal` — the five System tabs
  // (docs/system/chief-access.md). SQL-only grant, never click-grantable.
  chief_admin: 'supreme',
  // Full-platform reach, short of the supreme tier.
  super_admin: 'executive',
  platform_admin: 'executive',
  // A bounded domain of work: editorial, community, catalogue, support.
  editorial_admin: 'operational',
  senior_editor: 'operational',
  moderator: 'operational',
  marketplace_admin: 'operational',
  media_admin: 'operational',
  support_operator: 'operational',
  // Read-only measurement.
  analyst: 'analytical',
}

/** Lower rank wins the badge. Supreme is first so it can never be outranked. */
const TIER_RANK: Record<AdminRoleTier, number> = {
  supreme: 0,
  executive: 1,
  operational: 2,
  analytical: 3,
}

/**
 * The role to name someone by when they hold several: the highest-ranked tier,
 * ties broken by ALL_ADMIN_ROLES order so the answer is stable and never
 * depends on the row order `getAdminRoles()` happened to read back. Null when
 * the user holds no admin role (a coarse-gate-only editor, or a legacy `admin`
 * before `resolveAdminRoles()` applies the spec §17 alias).
 */
export function topTierRole(adminRoles: AdminRole[]): AdminRole | null {
  let best: AdminRole | null = null
  let bestRank = Number.POSITIVE_INFINITY
  let bestIndex = Number.POSITIVE_INFINITY
  for (const role of adminRoles) {
    const rank = TIER_RANK[ADMIN_ROLE_TIER[role]]
    const index = ALL_ADMIN_ROLES.indexOf(role)
    if (rank < bestRank || (rank === bestRank && index < bestIndex)) {
      best = role
      bestRank = rank
      bestIndex = index
    }
  }
  return best
}

/** Rank of a role's tier (0 = supreme). Presentation ordering only. */
export function roleTierRank(role: AdminRole): number {
  return TIER_RANK[ADMIN_ROLE_TIER[role]]
}

/** Every held role at one tier, in ALL_ADMIN_ROLES order — the "+N" chip. */
export function rolesInTier(adminRoles: AdminRole[], tier: AdminRoleTier): AdminRole[] {
  return adminRoles.filter((role) => ADMIN_ROLE_TIER[role] === tier)
}

/**
 * Capabilities held ONLY by the chief administrator. `ALL_CAPABILITIES`
 * picks up every future capability automatically, so the supreme tier is
 * defined as an exclusion list: everything except these two stays with the
 * super administrator. Granting `chief_admin` requires an explicit
 * `user_admin_roles` row (see docs/system/credentials.md runbook) — the
 * legacy-`admin` alias below deliberately resolves to `super_admin`, never
 * to chief, so the tier can never be inherited by accident.
 */
const SUPREME_CAPABILITIES: Capability[] = ['system.owner', 'secrets.reveal']

const ROLE_CAPABILITIES: Record<AdminRole, Capability[]> = {
  chief_admin: ALL_CAPABILITIES,
  super_admin: ALL_CAPABILITIES.filter((c) => !(SUPREME_CAPABILITIES as Capability[]).includes(c)),
  // Configuration, users, integrations and system settings (spec §17) — but
  // not branding.publish: publishing the public identity is a global branding
  // change (spec §44) that stays with the super admin.
  platform_admin: ALL_CAPABILITIES.filter(
    (c) => c !== 'branding.publish' && !(SUPREME_CAPABILITIES as Capability[]).includes(c),
  ),
  // Content, submissions and publishing.
  editorial_admin: [
    'viewDashboard',
    'moderate',
    'manageContent',
    'managePolls',
    'manageFundraisers',
    'managePolicies',
    'manageSiteContent',
    'manageNotifications',
  ],
  // Editorial review and publishing — narrower than editorial_admin (no
  // polls/fundraisers/site content).
  senior_editor: [
    'viewDashboard',
    'moderate',
    'manageContent',
    'manageFundraisers',
    'managePolicies',
    'manageSiteContent',
  ],
  // Community safety and reports.
  moderator: ['viewDashboard', 'moderate'],
  // Buy & Sell management.
  marketplace_admin: ['viewDashboard', 'listings.manage'],
  // Photo archive and media rights.
  media_admin: ['viewDashboard', 'media.manage'],
  // Read-only analytics.
  analyst: ['analytics.read'],
  // Limited operational access. Ticket/limited-user-view capabilities are not
  // modeled yet, so the least-privileged grant is the read-only dashboard.
  support_operator: ['viewDashboard'],
}

/** Capabilities granted by a set of admin roles (union). */
export function capabilitiesForAdminRoles(adminRoles: AdminRole[]): Set<Capability> {
  const caps = new Set<Capability>()
  for (const role of adminRoles) {
    for (const cap of ROLE_CAPABILITIES[role] ?? []) caps.add(cap)
  }
  return caps
}

/**
 * Effective capabilities: legacy app_role capabilities ∪ admin-role
 * capabilities. This is the set the fine-grained checks (`assertAdminRole`,
 * two-person approval eligibility) evaluate — pages still guard with
 * `requireCapability` / `assertCapability`, which the legacy map satisfies.
 */
export function effectiveCapabilities(roles: AppRole[], adminRoles: AdminRole[]): Set<Capability> {
  const caps = capabilitiesFor(roles)
  for (const cap of capabilitiesForAdminRoles(adminRoles)) caps.add(cap)
  return caps
}

/**
 * Bridge between the two layers. Explicit `user_admin_roles` rows are
 * authoritative; when none exist, a legacy `admin` is the spec §17 Super
 * Administrator alias, and everyone else has no admin role.
 */
export function resolveAdminRoles(roles: AppRole[], adminRoles: AdminRole[]): AdminRole[] {
  if (adminRoles.length > 0) return adminRoles
  return roles.includes('admin') ? ['super_admin'] : []
}

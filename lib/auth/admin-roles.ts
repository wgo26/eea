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

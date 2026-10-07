import {
  ChartColumn,
  Database,
  FileText,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  type LucideIcon,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Store,
  Tags,
  Users,
} from 'lucide-react'
import { type Capability } from '@/lib/auth/capabilities'
import { effectiveCapabilities, type AdminRole } from '@/lib/auth/admin-roles'
import type { AppRole } from '@/lib/auth/types'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

/**
 * Single source of the admin navigation (checklist items 5 + 7). Items are
 * filtered through the capability map — an editor never receives the users/
 * ads/storage/audit entries at all, so menus and routes stay in sync. Every
 * href is locale-prefixed (never a bare /admin constant).
 *
 * Icons are `lucide-react` components: the same geometry, sizing props and
 * tree-shaking the topbar, command palette and UI primitives already use, so the
 * shell reads as one product instead of mixing a hand-rolled stroke set with the
 * design system's.
 */

/** Nav entry keys — the string-valued sidebar labels (meta keys excluded). */
export type SidebarKey = Exclude<
  keyof Dictionary['admin']['sidebar'],
  'groups' | 'collapseNav' | 'expandNav' | 'brand' | 'consoleLabel'
>

/**
 * Count severity. `alert` = needs action now (renders destructive); `neutral` =
 * informational (renders a quiet chip). Defaults to neutral, so a newly badged
 * entry can never start shouting red on its own.
 */
export type AdminNavBadgeTone = 'alert' | 'neutral'

export type AdminNavItem = {
  key: SidebarKey
  /** Canonical, locale-free path (used for route matching). */
  path: string
  /** Locale-prefixed href (used for navigation). */
  href: string
  label: string
  icon: LucideIcon
  badge?: number
  badgeTone?: AdminNavBadgeTone
}

export type AdminNavDomain = 'command' | 'newsroom' | 'community' | 'catalogue' | 'platform'

export type AdminNavGroup = {
  domain: AdminNavDomain
  /** Localized domain header (from `dict.admin.sidebar.groups`). */
  label: string
  items: AdminNavItem[]
}

type AdminNavItemSpec = {
  key: SidebarKey
  path: string
  /** A single capability, or any-of a set (e.g. approvals: any gated action). */
  capability: Capability | Capability[]
  icon: LucideIcon
  domain: AdminNavDomain
  /** Severity for this entry's count badge (only consulted when it has one). */
  badgeTone?: AdminNavBadgeTone
}

/** The spec shape, exported so `lib/admin/nav-integrity.test.ts` can assert it. */
export type { AdminNavItemSpec }

function hasSpecCapability(spec: AdminNavItemSpec, caps: Set<Capability>): boolean {
  return Array.isArray(spec.capability)
    ? spec.capability.some((c) => caps.has(c))
    : caps.has(spec.capability)
}

/** The capabilities a spec admits, in list form (the any-of rule, one place). */
export function specCapabilities(spec: AdminNavItemSpec): Capability[] {
  return Array.isArray(spec.capability) ? spec.capability : [spec.capability]
}


/**
 * The navigation, partitioned by what the operator is TRYING to do.
 *
 * P2 (merged audit): 29 sections → 13 visible. Removed entries are UNLINKED,
 * not deleted — their pages keep their capability guards, so a direct URL
 * still enforces the same wall; the sidebar stops selling them as daily
 * destinations. Role reachability is preserved: analyst → insights,
 * marketplace_admin → listings, media_admin → media (see
 * lib/admin/nav-integrity.test.ts, which fails if any role loses its screen).
 * Trust & safety, inbox, policies, approvals, notifications, translations and
 * the ops-theater sections (states, secrets, incidents, emergency,
 * automations, templates, digest, branding, polls, fundraisers) remain
 * reachable by URL for the roles that hold their capabilities.
 */
export const ADMIN_NAV_SPECS: AdminNavItemSpec[] = [
  // Command — your own desk: what landed and how it is going.
  { key: 'dashboard', path: '/admin/dashboard', capability: 'viewDashboard', icon: LayoutDashboard, domain: 'command' },
  // Analyst role's screen (spec §17 `analytics.read`).
  { key: 'insights', path: '/admin/insights', capability: ['viewDashboard', 'analytics.read'], icon: ChartColumn, domain: 'command' },
  // Newsroom — making the paper.
  { key: 'content', path: '/admin/content', capability: 'manageContent', icon: FileText, domain: 'newsroom' },
  // Community — the moderation queue (trust-safety reports triage here too).
  { key: 'moderation', path: '/admin/moderation', capability: 'moderate', icon: ShieldCheck, domain: 'community', badgeTone: 'alert' },
  // Catalogue — the assets and surfaces the site is built from.
  { key: 'listings', path: '/admin/listings', capability: ['manageContent', 'listings.manage'], icon: Store, domain: 'catalogue' },
  { key: 'taxonomy', path: '/admin/taxonomy', capability: 'manageContent', icon: Tags, domain: 'catalogue' },
  { key: 'media', path: '/admin/media', capability: 'media.manage', icon: Images, domain: 'catalogue' },
  { key: 'siteContent', path: '/admin/site-content', capability: 'manageSiteContent', icon: LayoutTemplate, domain: 'catalogue' },
  { key: 'ads', path: '/admin/ads', capability: 'manageAds', icon: Megaphone, domain: 'catalogue' },
  // Platform — the machine, and who may operate it.
  { key: 'users', path: '/admin/users', capability: 'manageUsers', icon: Users, domain: 'platform' },
  // Supreme tier (docs/system/chief-access.md): storage, audit and security
  // stay visible to the chief only; states/secrets/incidents are URL-only.
  { key: 'storage', path: '/admin/storage-backup', capability: 'system.owner', icon: Database, domain: 'platform' },
  { key: 'audit', path: '/admin/audit-log', capability: 'system.owner', icon: ScrollText, domain: 'platform' },
  { key: 'security', path: '/admin/security', capability: 'system.owner', icon: Lock, domain: 'platform' },
]

const ADMIN_NAV_DOMAIN_ORDER: AdminNavDomain[] = ['command', 'newsroom', 'community', 'catalogue', 'platform']

/**
 * Every navigable admin section, before capability filtering. The identity chip
 * renders "{visible} of {total} sections" against this so a Moderator can see
 * how much of the console they cannot reach — the honest framing of a role set.
 */
export const ADMIN_NAV_TOTAL = ADMIN_NAV_SPECS.length

/** Live queue counts for badged entries (all optional — absent means no badge). */
export type AdminNavBadges = {
  translations?: number
  digest?: number
}

function navItemFromSpec(
  spec: AdminNavItemSpec,
  locale: Locale,
  dict: Dictionary,
  pendingCount: number,
  unreadNotifications: number,
  badges: AdminNavBadges = {},
): AdminNavItem {
  // P6: translations + digest join moderation/inbox as badged queues so no
  // work queue is discoverable only by opening its page. Tones stay quiet
  // (neutral) except moderation's alert — badges inform, only one shouts.
  const badge =
    spec.key === 'moderation'
      ? pendingCount
      : spec.key === 'inbox'
        ? unreadNotifications
        : spec.key === 'translations'
          ? badges.translations
          : spec.key === 'digest'
            ? badges.digest
            : undefined
  return {
    key: spec.key,
    path: spec.path,
    href: localePath(locale, spec.path),
    label: dict.admin.sidebar[spec.key],
    icon: spec.icon,
    badge,
    badgeTone: badge != null && badge > 0 ? (spec.badgeTone ?? 'neutral') : undefined,
  }
}

/** Locale-prefixed admin entries the given roles may see (flat, spec order). */
export function buildAdminNavItems(
  locale: Locale,
  dict: Dictionary,
  roles: AppRole[],
  pendingCount = 0,
  adminRoles: AdminRole[] = [],
  unreadNotifications = 0,
  badges: AdminNavBadges = {},
): AdminNavItem[] {
  const caps = effectiveCapabilities(roles, adminRoles)
  return ADMIN_NAV_SPECS.filter((spec) => hasSpecCapability(spec, caps)).map((spec) =>
    navItemFromSpec(spec, locale, dict, pendingCount, unreadNotifications, badges),
  )
}

/**
 * Capability-filtered nav grouped by operational domain. The domain order is
 * stable; a domain with no visible items is omitted entirely. Group labels
 * come from `dict.admin.sidebar.groups`, so the sidebar renders localized
 * headers without any hardcoded strings.
 */
export function buildAdminNavGroups(
  locale: Locale,
  dict: Dictionary,
  roles: AppRole[],
  pendingCount = 0,
  adminRoles: AdminRole[] = [],
  unreadNotifications = 0,
  badges: AdminNavBadges = {},
): AdminNavGroup[] {
  const caps = effectiveCapabilities(roles, adminRoles)
  const groups = new Map<AdminNavDomain, AdminNavItem[]>()
  for (const spec of ADMIN_NAV_SPECS) {
    if (!hasSpecCapability(spec, caps)) continue
    const item = navItemFromSpec(spec, locale, dict, pendingCount, unreadNotifications, badges)
    const list = groups.get(spec.domain)
    if (list) list.push(item)
    else groups.set(spec.domain, [item])
  }
  const result: AdminNavGroup[] = []
  for (const domain of ADMIN_NAV_DOMAIN_ORDER) {
    const items = groups.get(domain)
    if (items) result.push({ domain, label: dict.admin.sidebar.groups[domain], items })
  }
  return result
}

export function adminHomeHref(locale: Locale): string {
  return localePath(locale, '/admin/dashboard')
}

export function adminBackToSiteHref(locale: Locale): string {
  return localePath(locale, '/')
}

/**
 * Which operational domain and entry the current route belongs to — drives
 * the topbar breadcrumbs (Phase B). Matches on the locale-free canonical path
 * so it works with or without the locale prefix.
 *
 * Returns the matched `path` as well as the labels: the breadcrumb needs to link
 * the section crumb, and the footer needs to look up the section's state row,
 * both keyed by canonical path. Longest match wins so `/admin/content/timeline`
 * resolves to Content rather than a shorter unrelated prefix.
 */
export function findAdminNavLocation(
  groups: AdminNavGroup[],
  pathname: string,
): { groupLabel: string; itemLabel: string; path: string } | null {
  let best: { groupLabel: string; itemLabel: string; path: string; length: number } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const match =
        pathname === item.path ||
        pathname.startsWith(`${item.path}/`) ||
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`)
      if (match && (!best || item.path.length > best.length)) {
        best = {
          groupLabel: group.label,
          itemLabel: item.label,
          path: item.path,
          length: item.path.length,
        }
      }
    }
  }
  return best ? { groupLabel: best.groupLabel, itemLabel: best.itemLabel, path: best.path } : null
}


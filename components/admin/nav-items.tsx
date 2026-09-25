import {
  Bell,
  CalendarClock,
  ChartColumn,
  ClipboardCheck,
  Database,
  FileStack,
  FileText,
  Gauge,
  HeartHandshake,
  Inbox,
  KeyRound,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  type LucideIcon,
  Megaphone,
  Palette,
  Radio,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Store,
  Tags,
  Users,
  Vote,
  Zap,
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

export type AdminNavDomain = 'command' | 'editorial' | 'safety' | 'system'

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

function hasSpecCapability(spec: AdminNavItemSpec, caps: Set<Capability>): boolean {
  return Array.isArray(spec.capability)
    ? spec.capability.some((c) => caps.has(c))
    : caps.has(spec.capability)
}

const ADMIN_NAV_SPECS: AdminNavItemSpec[] = [
  // Executive / Command
  { key: 'dashboard', path: '/admin/dashboard', capability: 'viewDashboard', icon: LayoutDashboard, domain: 'command' },
  { key: 'inbox', path: '/admin/inbox', capability: 'viewDashboard', icon: Inbox, domain: 'command', badgeTone: 'neutral' },
  { key: 'insights', path: '/admin/insights', capability: 'viewDashboard', icon: ChartColumn, domain: 'command' },
  // Editorial & Community
  { key: 'content', path: '/admin/content', capability: 'manageContent', icon: FileText, domain: 'editorial' },
  { key: 'emergency', path: '/admin/emergency', capability: 'manageContent', icon: Radio, domain: 'editorial' },
  { key: 'digest', path: '/admin/digest', capability: 'manageContent', icon: CalendarClock, domain: 'editorial' },
  { key: 'templates', path: '/admin/templates', capability: 'manageContent', icon: FileStack, domain: 'editorial' },
  { key: 'automations', path: '/admin/automations', capability: 'manageContent', icon: Zap, domain: 'editorial' },
  { key: 'translations', path: '/admin/translations', capability: 'manageContent', icon: Languages, domain: 'editorial' },
  { key: 'listings', path: '/admin/listings', capability: 'manageContent', icon: Store, domain: 'editorial' },
  { key: 'taxonomy', path: '/admin/taxonomy', capability: 'manageContent', icon: Tags, domain: 'editorial' },
  { key: 'polls', path: '/admin/polls', capability: 'managePolls', icon: Vote, domain: 'editorial' },
  { key: 'fundraisers', path: '/admin/fundraisers', capability: 'manageFundraisers', icon: HeartHandshake, domain: 'editorial' },
  { key: 'siteContent', path: '/admin/site-content', capability: 'manageSiteContent', icon: LayoutTemplate, domain: 'editorial' },
  { key: 'branding', path: '/admin/branding', capability: 'branding.publish', icon: Palette, domain: 'editorial' },
  // Trust & Governance — only moderation's count is action-now; mail is not.
  { key: 'moderation', path: '/admin/moderation', capability: 'moderate', icon: ShieldCheck, domain: 'safety', badgeTone: 'alert' },
  { key: 'trustSafety', path: '/admin/trust-safety', capability: 'moderate', icon: ShieldAlert, domain: 'safety' },
  { key: 'incidents', path: '/admin/incidents', capability: 'incidents.manage', icon: Siren, domain: 'safety' },
  { key: 'approvals', path: '/admin/approvals', capability: ['secrets.revoke', 'incidents.manage', 'branding.publish', 'system.configure', 'manageUsers'], icon: ClipboardCheck, domain: 'safety' },
  { key: 'policies', path: '/admin/policies', capability: 'managePolicies', icon: Scale, domain: 'safety' },
  { key: 'users', path: '/admin/users', capability: 'manageUsers', icon: Users, domain: 'safety' },
  { key: 'ads', path: '/admin/ads', capability: 'manageAds', icon: Megaphone, domain: 'safety' },
  { key: 'notifications', path: '/admin/notifications', capability: 'manageNotifications', icon: Bell, domain: 'safety' },
  // System & Infrastructure
  { key: 'states', path: '/admin/states', capability: 'system.configure', icon: Gauge, domain: 'system' },
  { key: 'secrets', path: '/admin/secrets', capability: 'secrets.read_metadata', icon: KeyRound, domain: 'system' },
  { key: 'storage', path: '/admin/storage-backup', capability: 'manageStorage', icon: Database, domain: 'system' },
  { key: 'audit', path: '/admin/audit-log', capability: 'viewAuditLog', icon: ScrollText, domain: 'system' },
  { key: 'security', path: '/admin/security', capability: 'viewAuditLog', icon: Lock, domain: 'system' },
]

const ADMIN_NAV_DOMAIN_ORDER: AdminNavDomain[] = ['command', 'editorial', 'safety', 'system']

function navItemFromSpec(
  spec: AdminNavItemSpec,
  locale: Locale,
  dict: Dictionary,
  pendingCount: number,
  unreadNotifications: number,
): AdminNavItem {
  const badge = spec.key === 'moderation' ? pendingCount : spec.key === 'inbox' ? unreadNotifications : undefined
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
): AdminNavItem[] {
  const caps = effectiveCapabilities(roles, adminRoles)
  return ADMIN_NAV_SPECS.filter((spec) => hasSpecCapability(spec, caps)).map((spec) =>
    navItemFromSpec(spec, locale, dict, pendingCount, unreadNotifications),
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
): AdminNavGroup[] {
  const caps = effectiveCapabilities(roles, adminRoles)
  const groups = new Map<AdminNavDomain, AdminNavItem[]>()
  for (const spec of ADMIN_NAV_SPECS) {
    if (!hasSpecCapability(spec, caps)) continue
    const item = navItemFromSpec(spec, locale, dict, pendingCount, unreadNotifications)
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
 */
export function findAdminNavLocation(
  groups: AdminNavGroup[],
  pathname: string,
): { groupLabel: string; itemLabel: string } | null {
  let best: { groupLabel: string; itemLabel: string; length: number } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const match =
        pathname === item.path ||
        pathname.startsWith(`${item.path}/`) ||
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`)
      if (match && (!best || item.path.length > best.length)) {
        best = { groupLabel: group.label, itemLabel: item.label, length: item.path.length }
      }
    }
  }
  return best ? { groupLabel: best.groupLabel, itemLabel: best.itemLabel } : null
}


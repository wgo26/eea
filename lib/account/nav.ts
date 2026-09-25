import { getDictionary, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { localePath } from '@/lib/i18n/urls'

/**
 * Single source of the Account App navigation (checklist items 7 + 11;
 * Account audit §2.1): ten flat tabs became three groups — Activity, Library,
 * Settings — consumed by the desktop bar (flat anchors + a "More" menu), the
 * mobile drawer and every `AccountPageShell` breadcrumb.
 *
 * Pure data + logic: no icons and no component imports, so it is unit-testable
 * and reusable from server reads. Icons resolve through `ACCOUNT_NAV_ICONS` in
 * `components/account/account-nav-icons.ts`. Hrefs are locale-prefixed here;
 * `path` stays canonical for route matching.
 */

export type AccountNavGroupKey = 'activity' | 'library' | 'settings'

/** Keys of `dict.account.topbar` that name a nav destination. */
export type AccountNavItemKey =
  | 'dashboard'
  | 'submissions'
  | 'listings'
  | 'messages'
  | 'saved'
  | 'follows'
  | 'recent'
  | 'profile'
  | 'notifications'
  | 'security'

/** A breadcrumb entry: the last one is the current page (no href). */
export type AccountBreadcrumb = { label: string; href?: string }

export type AccountNavItem = {
  key: AccountNavItemKey
  /** Canonical, locale-free path (used for route matching). */
  path: string
  /** Locale-prefixed href (used for navigation). */
  href: string
  label: string
  badge?: number
}

export type AccountNavGroup = {
  key: AccountNavGroupKey
  /** Localized group header (from `dict.account.topbar.groups`). */
  label: string
  items: AccountNavItem[]
}

type AccountNavSpec = {
  key: AccountNavItemKey
  path: string
  group: AccountNavGroupKey
}

const ACCOUNT_NAV_SPECS: AccountNavSpec[] = [
  { key: 'dashboard', path: '/account/dashboard', group: 'activity' },
  { key: 'submissions', path: '/account/submissions', group: 'activity' },
  { key: 'listings', path: '/account/listings', group: 'activity' },
  { key: 'messages', path: '/account/messages', group: 'activity' },
  { key: 'saved', path: '/account/saved', group: 'library' },
  { key: 'follows', path: '/account/follows', group: 'library' },
  { key: 'recent', path: '/account/recent', group: 'library' },
  { key: 'profile', path: '/account/profile', group: 'settings' },
  { key: 'notifications', path: '/account/notifications', group: 'settings' },
  { key: 'security', path: '/account/security', group: 'settings' },
]

const ACCOUNT_NAV_GROUP_ORDER: AccountNavGroupKey[] = ['activity', 'library', 'settings']

/**
 * Groups + items with badges applied. `unreadNotifications` decorates the
 * Notifications entry — the count that used to sit on a tenth flat tab now
 * lives where users look for it.
 */
export function buildAccountNavGroups(
  locale: Locale,
  dict: Dictionary,
  opts: { unreadNotifications?: number } = {},
): AccountNavGroup[] {
  const { unreadNotifications = 0 } = opts
  const byKey = new Map<AccountNavGroupKey, AccountNavItem[]>()
  for (const spec of ACCOUNT_NAV_SPECS) {
    const item: AccountNavItem = {
      key: spec.key,
      path: spec.path,
      href: localePath(locale, spec.path),
      label: dict.account.topbar[spec.key],
      badge: spec.key === 'notifications' ? unreadNotifications : undefined,
    }
    const list = byKey.get(spec.group)
    if (list) list.push(item)
    else byKey.set(spec.group, [item])
  }
  return ACCOUNT_NAV_GROUP_ORDER.map((key) => ({
    key,
    label: dict.account.topbar.groups[key],
    items: byKey.get(key) ?? [],
  }))
}

/**
 * Anchors shown flat on the desktop bar: the area home plus one entry per
 * group. Everything else folds into the "More" menu, so the bar never becomes
 * the unbounded horizontal scroll strip the audit flagged.
 */
export const ACCOUNT_PRIMARY_TABS: AccountNavItemKey[] = ['dashboard', 'submissions', 'saved', 'profile']

/** Flat bar links, plus the remaining items still grouped for the menu. */
export function splitAccountNav(
  groups: AccountNavGroup[],
  primaryKeys: AccountNavItemKey[] = ACCOUNT_PRIMARY_TABS,
): { tabs: AccountNavItem[]; overflow: AccountNavGroup[] } {
  const wanted = new Set(primaryKeys)
  const tabs: AccountNavItem[] = []
  const overflow: AccountNavGroup[] = []
  for (const group of groups) {
    for (const item of group.items) {
      if (wanted.has(item.key)) tabs.push(item)
    }
    const rest = group.items.filter((item) => !wanted.has(item.key))
    if (rest.length > 0) overflow.push({ ...group, items: rest })
  }
  return { tabs, overflow }
}

/** Which nav entry a route belongs to — longest match wins. */
export function findAccountNavLocation(
  groups: AccountNavGroup[],
  pathname: string,
): { group: AccountNavGroup; item: AccountNavItem } | null {
  let best: { group: AccountNavGroup; item: AccountNavItem } | null = null
  let bestLength = -1
  for (const group of groups) {
    for (const item of group.items) {
      const matches =
        pathname === item.path ||
        pathname.startsWith(`${item.path}/`) ||
        pathname === item.href ||
        pathname.startsWith(`${item.href}/`)
      if (matches && item.path.length > bestLength) {
        best = { group, item }
        bestLength = item.path.length
      }
    }
  }
  return best
}

/**
 * Breadcrumb trail (Account › Group › Page). On the Dashboard — the area's
 * landing page — the trail collapses to one label so the header never reads
 * "Account › Activity › Dashboard". The group crumb only links when it
 * resolves to a page other than the one already open.
 */
export function accountBreadcrumbs(
  locale: Locale,
  dict: Dictionary,
  groups: AccountNavGroup[],
  currentPath: string,
): AccountBreadcrumb[] {
  const homeHref = localePath(locale, '/account/dashboard')
  const location = findAccountNavLocation(groups, currentPath)
  if (!location) return [{ label: dict.account.topbar.portal }]
  const { group, item } = location
  if (item.key === 'dashboard') return [{ label: item.label }]
  const groupHref = group.items.find((i) => i.path !== item.path)?.href ?? homeHref
  return [
    { label: dict.account.topbar.portal, href: homeHref },
    { label: group.label, href: groupHref },
    { label: item.label },
  ]
}

/**
 * Trail for a page, from its canonical (locale-free) route. `usePathname` is
 * client-only, so pages declare their own path; deriving the trail here keeps
 * every page honest to the nav source instead of hand-writing crumbs that
 * drift the moment a section is renamed (Account audit §2.3).
 */
export function accountPageBreadcrumb(locale: Locale, canonicalPath: string): AccountBreadcrumb[] {
  const dict = getDictionary(locale)
  return accountBreadcrumbs(locale, dict, buildAccountNavGroups(locale, dict), canonicalPath)
}

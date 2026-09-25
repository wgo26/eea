'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDictionary, type Locale } from '@/lib/i18n'
import { useLocaleFromPath } from '@/components/site-header'
import { SiteMark } from '@/components/site-mark'
import type { AppRole } from '@/lib/auth/types'
import type { AdminRole } from '@/lib/auth/admin-roles'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  adminBackToSiteHref,
  adminHomeHref,
  buildAdminNavGroups,
  type AdminNavItem,
} from './nav-items'
import {
  ADMIN_NAV_ACTIVE_BAR_CLASS,
  ADMIN_NAV_BADGE_CLASS,
  ADMIN_NAV_DOMAIN_TOGGLE_CLASS,
  ADMIN_NAV_SECTION_LABEL_CLASS,
  RAIL_SHORTCUT_KEY,
  SHORTCUT_ATTR,
  SHORTCUT_MODIFIER,
  adminNavBadgeClass,
  adminNavRowClass,
} from './nav-styles'
import { useCollapsedDomains, useRecentPaths, useSidebarRail } from './nav-preferences'

/**
 * True while the user is typing, so the Cmd/Ctrl+B rail toggle never eats a
 * character from an admin form.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function isActiveItem(pathname: string, item: AdminNavItem): boolean {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    pathname === item.path ||
    pathname.startsWith(`${item.path}/`)
  )
}

/** Keyboard hint rendered inside a tooltip (`Kbd` styles itself on tooltips). */
function ShortcutHint() {
  return (
    <>
      <Kbd>{SHORTCUT_MODIFIER}</Kbd>
      <Kbd>B</Kbd>
    </>
  )
}

function Badge({ count, tone }: { count: number; tone: AdminNavItem['badgeTone'] }) {
  return (
    <span data-slot="admin-nav-badge" className={cn(ADMIN_NAV_BADGE_CLASS, adminNavBadgeClass(tone))}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavRow({
  item,
  pathname,
  rail,
  onNavigate,
}: {
  item: AdminNavItem
  pathname: string
  rail: boolean
  onNavigate?: (item: AdminNavItem) => void
}) {
  const active = isActiveItem(pathname, item)
  const Icon = item.icon
  const count = item.badge != null && item.badge > 0 ? item.badge : 0

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate ? () => onNavigate(item) : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? item.label : undefined}
      data-active={active ? 'true' : undefined}
      className={adminNavRowClass(active, rail ? 'rail' : 'sidebar')}
    >
      {active && <span aria-hidden className={ADMIN_NAV_ACTIVE_BAR_CLASS} />}
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" aria-hidden />
        {/* Rail mode hides the text, so the count survives as a corner dot. */}
        {rail && count > 0 && (
          <span
            aria-hidden
            className={cn(
              'absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar',
              item.badgeTone === 'alert' ? 'bg-destructive' : 'bg-muted-foreground',
            )}
          />
        )}
      </span>
      {!rail && <span className="flex-1 truncate">{item.label}</span>}
      {!rail && count > 0 && <Badge count={count} tone={item.badgeTone} />}
    </Link>
  )

  if (!rail) return link
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block" />}>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {count > 0 && <span className="font-semibold tabular-nums">{count > 99 ? '99+' : count}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Admin sidebar (AppShell, desktop).
 *
 * Menu visibility comes from the capability map via `buildAdminNavGroups` —
 * editors don't see users/ads/storage/audit entries at all, and an empty domain
 * disappears with them. Two widths: the expanded view renders the four
 * operational domains as collapsible sections with counts; the 64px icon rail
 * drops the group chrome, keeps a divider per domain and surfaces labels as
 * tooltips. Rail state, collapsed domains and recents are per-device
 * preferences read through `nav-preferences.ts`.
 *
 * The presentation details that make it read as an operations console:
 *   - the header is `h-14` and rows are 36px, so the brand block lines up with
 *     the topbar and its controls across the whole shell;
 *   - the current page is a quiet `sidebar-accent` row plus a gold rail, not a
 *     solid brand fill, so labels, icons and counts stay legible;
 *   - only counts that need action now are destructive red;
 *   - domain labels are sticky, so a twelve-entry group never scrolls away from
 *     its heading;
 *   - Cmd/Ctrl+B toggles the rail, matching the shortcut the topbar advertises.
 */
export function AdminSidebar({
  pendingCount = 0,
  roles,
  adminRoles = [],
  unreadNotifications = 0,
  logoUrl = null,
}: {
  pendingCount?: number
  roles: AppRole[]
  adminRoles?: AdminRole[]
  unreadNotifications?: number
  logoUrl?: string | null
}) {
  const pathname = usePathname() ?? ''
  const locale: Locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const groups = buildAdminNavGroups(locale, dict, roles, pendingCount, adminRoles, unreadNotifications)
  const { rail, toggleRail } = useSidebarRail()
  const { collapsed, toggleDomain } = useCollapsedDomains()
  const { paths: recentPaths, pushPath } = useRecentPaths()

  const t = dict.admin.sidebar
  const navLabel = t.consoleLabel
  const railToggleLabel = rail ? t.expandNav : t.collapseNav

  // Cmd/Ctrl+B, ignored while typing so the shortcut never steals a character
  // from an admin form. The topbar toggle and this listener share one store.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== RAIL_SHORTCUT_KEY) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      toggleRail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleRail])

  // Recents are stored as plain paths and resolved against the current
  // capability-filtered nav, so a revoked entry or a language switch can
  // never surface a stale or unauthorized shortcut.
  const allItems = groups.flatMap((g) => g.items)
  const recents = recentPaths
    .map((p) => allItems.find((i) => i.path === p))
    .filter((i): i is AdminNavItem => i != null)

  const recordRecent = (item: AdminNavItem) => pushPath(item.path)

  if (rail) {
    return (
      <aside
        data-slot="admin-sidebar"
        className="flex h-full w-16 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border">
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={adminHomeHref(locale)}
                  aria-label={t.consoleLabel}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              <SiteMark
                logoUrl={logoUrl}
                alt={t.brand}
                badgeClassName="h-9 w-9 rounded-xl"
                iconClassName="h-5 w-5"
                imgClassName="h-9 w-auto max-w-12 rounded-lg object-contain"
              />
            </TooltipTrigger>
            <TooltipContent side="right">{t.consoleLabel}</TooltipContent>
          </Tooltip>
        </div>
        <nav
          className="admin-nav-scroll flex-1 space-y-1 overflow-y-auto overscroll-contain p-2"
          aria-label={navLabel}
        >
          {groups.map((group, gi) => (
            <div
              key={group.domain}
              className={cn('space-y-1', gi > 0 && 'mt-2 border-t border-sidebar-border/70 pt-2')}
            >
              {group.items.map((item) => (
                <NavRow key={item.path} item={item} pathname={pathname} rail onNavigate={recordRecent} />
              ))}
            </div>
          ))}
        </nav>
        <div className="shrink-0 space-y-1 border-t border-sidebar-border p-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleRail}
                  aria-label={railToggleLabel}
                  aria-keyshortcuts={SHORTCUT_ATTR}
                  className="flex h-10 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="right">
              {railToggleLabel}
              <ShortcutHint />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={adminBackToSiteHref(locale)}
                  aria-label={t.backToSite}
                  className="flex h-10 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="right">{t.backToSite}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    )
  }

  return (
    <aside
      data-slot="admin-sidebar"
      className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      {/* Brand lockup — the same mark the public header falls back to, with the
          console label underneath so staff always know which surface this is. */}
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-sidebar-border px-3">
        <Link
          href={adminHomeHref(locale)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SiteMark
            logoUrl={logoUrl}
            alt={t.brand}
            badgeClassName="h-9 w-9 rounded-xl"
            iconClassName="h-5 w-5"
            imgClassName="h-9 w-auto max-w-14 rounded-lg object-contain"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold leading-5">{t.brand}</span>
            <span className="truncate text-xs leading-4 text-muted-foreground">{t.consoleLabel}</span>
          </span>
        </Link>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={toggleRail}
                aria-label={railToggleLabel}
                aria-keyshortcuts={SHORTCUT_ATTR}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="right">
            {railToggleLabel}
            <ShortcutHint />
          </TooltipContent>
        </Tooltip>
      </div>

      <nav
        className="admin-nav-scroll flex-1 overflow-y-auto overscroll-contain px-2 py-3"
        aria-label={navLabel}
      >
        {recents.length > 0 && (
          <div className="mb-3">
            <p className={cn(ADMIN_NAV_SECTION_LABEL_CLASS, 'px-3 py-1.5')}>{t.recents}</p>
            <div className="space-y-0.5">
              {recents.map((item) => {
                const active = isActiveItem(pathname, item)
                const Icon = item.icon
                return (
                  <Link
                    key={`recent-${item.path}`}
                    href={item.href}
                    onClick={() => recordRecent(item)}
                    aria-current={active ? 'page' : undefined}
                    className={adminNavRowClass(active, 'sidebar')}
                  >
                    {active && <span aria-hidden className={ADMIN_NAV_ACTIVE_BAR_CLASS} />}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
        {groups.map((group, gi) => {
          const isCollapsed = collapsed.includes(group.domain)
          const listId = `admin-nav-domain-${group.domain}`
          return (
            <div key={group.domain} className={cn(gi > 0 && 'mt-3 border-t border-sidebar-border/70 pt-2')}>
              <button
                type="button"
                onClick={() => toggleDomain(group.domain)}
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                className={ADMIN_NAV_DOMAIN_TOGGLE_CLASS}
              >
                {group.label}
                <ChevronRight
                  className={cn('ml-auto h-3.5 w-3.5 shrink-0 transition-transform', !isCollapsed && 'rotate-90')}
                  aria-hidden
                />
              </button>
              {!isCollapsed && (
                <div id={listId} className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => (
                    <NavRow
                      key={item.path}
                      item={item}
                      pathname={pathname}
                      rail={false}
                      onNavigate={recordRecent}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <Link
          href={adminBackToSiteHref(locale)}
          className="flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{t.backToSite}</span>
        </Link>
      </div>
    </aside>
  )
}


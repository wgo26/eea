'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { entityContextFor } from '@/lib/admin/entity-context'
import { useLocaleFromPath } from '@/components/site-header'
import { findAdminNavLocation, type AdminNavGroup } from './nav-items'

/**
 * Admin breadcrumbs + section state (AppShell, plan Phase 4).
 *
 * Replaces the inline span run the topbar carried. That version had three
 * problems: it was not list semantics (a screen-reader user could not tell they
 * were at the end of the trail — `PageHeader`'s breadcrumb got the same fix),
 * it dropped whole levels below `lg` instead of collapsing, and it never said
 * WHICH record you were on: `/admin/users/9f3c…` and `/admin/users` rendered
 * identically.
 *
 * WHY THE PATHNAME COMES FROM THE CLIENT: a Next.js layout cannot read it, and
 * this lives in the layout, so a child page cannot hand it up either.
 * `usePathname()` is the only correct source, and the resolution itself is pure
 * (`lib/admin/entity-context.ts`) so it is unit-tested rather than render-tested.
 *
 * WHY EVERY CRUMB IS SAFE: the trail is built from the viewer's own
 * capability-filtered nav groups, so a crumb that would bounce to
 * not-authorized is never rendered — the same rule the sidebar and ⌘K follow.
 * The record crumb therefore links to its SECTION (a live destination) instead
 * of being a dead label.
 *
 * DEVIATION FROM THE PLAN, DELIBERATE: the section-state row renders inline as a
 * trailing chip, not on a second header line. A sticky header that is 56px on
 * Content and 76px on Moderation shifts the page below it on every navigation,
 * which costs the operator more than the extra row buys. Same facts, one line.
 *
 * Those facts are the ones the layout ALREADY resolved. Deriving draft/published
 * counts would add org-wide queries to all ~44 admin screens to render a number
 * the dashboard already shows, and caching them would make a just-published
 * story read as a draft — lib/admin/actions/* revalidates with page-level
 * `revalidatePath`, not tags, so a cached shell read cannot be busted cheaply.
 */
export function AdminBreadcrumbs({
  groups,
  sectionState,
}: {
  groups: AdminNavGroup[]
  /** Advisory counts for a section, keyed by canonical path. */
  sectionState: Record<string, { count: number; label: string } | undefined>
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const topbar = dict.admin.topbar
  const pathname = usePathname() ?? ''

  const location = findAdminNavLocation(groups, pathname)

  // URL-only desks (secrets, states, inbox, emergency…) have no nav entry, so
  // the lookup misses — but a blank header is worse than an approximate one.
  // Fall back to a prettified path segment so every admin screen still answers
  // "where am I". The crumb links to the section root operators can open.
  const fallback = location == null ? fallbackLocation(pathname) : null
  const trail = location ?? fallback
  if (!trail) return null

  // On a detail route the matched section is the parent crumb and the id is the
  // leaf; on a section route the section itself is the leaf.
  const entity = entityContextFor(pathname, trail.path)
  const state = sectionState[trail.path]

  return (
    // Hidden below `md`, as the inline trail it replaces was: at phone width the
    // topbar is already carrying the drawer button, quick actions, attention,
    // preferences and identity, and a truncated two-word crumb adds nothing there
    // that the drawer does not already show.
    <nav aria-label={topbar.breadcrumbLabel} className="hidden min-w-0 flex-1 md:block">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="shrink-0">
          <Link
            href={localePath(locale, '/admin/dashboard')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {topbar.admin}
          </Link>
        </li>

        {/* Under `lg` the domain goes first: it is the least specific level, and
            the sidebar already groups by it visually. */}
        <li className="hidden min-w-0 shrink items-center gap-1.5 lg:flex">
          <Separator />
          <span className="truncate text-muted-foreground/80">{trail.groupLabel}</span>
        </li>

        <li className="flex min-w-0 items-center gap-1.5">
          <Separator />
          {entity ? (
            <Link
              href={localePath(locale, entity.sectionPath)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              {trail.itemLabel}
            </Link>
          ) : (
            <span aria-current="page" className="min-w-0 truncate font-medium text-foreground">
              {trail.itemLabel}
            </span>
          )}
        </li>

        {entity && (
          <li className="flex min-w-0 items-center gap-1.5">
            <Separator />
            <span
              aria-current="page"
              // The full id stays reachable: the crumb compresses it for space,
              // and a support thread quoting a URL needs the whole thing.
              title={entity.recordId}
              className="min-w-0 truncate font-mono text-[13px] font-medium text-foreground"
            >
              {entity.label}
            </span>
          </li>
        )}

        {state && state.count > 0 && (
          <li className="ml-auto hidden shrink-0 xl:block">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {state.count} {state.label}
            </span>
          </li>
        )}
      </ol>
    </nav>
  )
}

function Separator() {
  return (
    <span aria-hidden className="shrink-0 text-muted-foreground/50">
      /
    </span>
  )
}

/**
 * Last-resort trail for admin paths with no nav entry (URL-only desks). The
 * segment after `/admin/` becomes the label ("storage-backup" → "Storage
 * backup") under the closest group name we can honestly claim — the admin
 * root itself. Deliberately unlocalized: these desks are staff-only surfaces
 * whose pages already own their localized titles; the breadcrumb's job here
 * is orientation, not translation.
 */
function fallbackLocation(pathname: string): { path: string; itemLabel: string; groupLabel: string } | null {
  const match = pathname.match(/\/(?:en|fr)\/admin\/([^/]+)/) ?? pathname.match(/\/admin\/([^/]+)/)
  const segment = match?.[1]
  if (!segment) return null
  const itemLabel = segment
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
  return { path: `/admin/${segment}`, itemLabel, groupLabel: 'Admin' }
}

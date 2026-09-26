/**
 * Entity context for the admin breadcrumb (plan Phase 4).
 *
 * The topbar needs to answer "which record am I looking at" on a detail route
 * (`/admin/users/<id>`, `/admin/moderation/<id>`). It cannot ask the server:
 * a Next.js layout has no access to the current pathname, and the topbar lives
 * in the layout — so a child page cannot hand it up either. The client can, via
 * `usePathname()`, and the only thing it needs to work out is where the section
 * stops and the record begins. That is pure string work, so it lives here where
 * it can be unit-tested instead of being inlined into render.
 *
 * Deliberately NOT a title lookup: resolving `<id>` to a headline would need a
 * query keyed by a pathname the server never sees, which means a client fetch on
 * every detail page for one line of chrome. The record's own page already names
 * it in `PageHeader`. What the topbar adds is position, and an id short enough
 * to read at a glance but real enough to compare against a URL or a log line.
 */

import { SUB_ROUTES } from './nav-integrity'
import { stripLocalePrefix } from '@/lib/i18n/urls'

/** Longest id shown before it is compressed; keeps the row from pushing the nav. */
const ID_HEAD = 8
const ID_TAIL = 4

/**
 * A dynamic segment as it appears on disk (`[id]`) or in a URL (a bare id).
 * Only single-segment detail routes are modeled — every admin detail page is
 * one (`users/[id]`, `moderation/[id]`, `incidents/[id]`, `secrets/[id]`,
 * `branding/[id]`), and anything deeper is a static sub-route, not an entity.
 */
export function compressRecordId(id: string): string {
  const clean = id.trim()
  if (clean.length <= ID_HEAD + ID_TAIL + 1) return clean
  return `${clean.slice(0, ID_HEAD)}…${clean.slice(-ID_TAIL)}`
}

export type EntityContext = {
  /** The canonical section path the record belongs to, locale-free. */
  sectionPath: string
  /** The raw id from the URL. */
  recordId: string
  /** Compressed display text. */
  label: string
}

/**
 * The record a pathname points at, given the section it matched.
 *
 * `sectionPath` comes from `findAdminNavLocation`, so the caller has already
 * resolved the viewer's own capability-filtered nav — a record under a section
 * they cannot see never reaches here and so never renders a crumb they cannot
 * follow.
 *
 * A detail route is exactly ONE segment past its section (`/admin/users/<id>`).
 * Two things that are not: a deeper nesting we do not model, and a static child
 * like `/admin/branding/colors`, which is a section of its own and not a record
 * called "colors". The static list is keyed BY SECTION, so `branding/new` is
 * correctly not an id while a hypothetical `users/new` still would be.
 */
export function entityContextFor(pathname: string, sectionPath: string): EntityContext | null {
  // Canonicalized first: `usePathname()` hands back the prefixed URL
  // (`/en/admin/users/9f...`) while nav entries key on `/admin/users`. Skip this
  // and every detail route looks like a section, so the record crumb never
  // renders on the one screen it exists for.
  const clean = stripLocalePrefix(pathname)
  if (clean === sectionPath) return null
  if (!clean.startsWith(`${sectionPath}/`)) return null
  const segments = clean.slice(sectionPath.length + 1).split('/').filter(Boolean)
  if (segments.length !== 1) return null
  const id = segments[0]
  if (isStaticSubRoute(sectionPath, id)) return null
  return { sectionPath, recordId: id, label: compressRecordId(id) }
}

/**
 * The locale-free form of a live pathname.
 *
 * `usePathname()` returns the URL as the browser sees it, and this project
 * prefixes every user-facing URL (`/en/admin/users/9f…`), while nav entries and
 * this module key on canonical paths (`/admin/users`). Without stripping the
 * prefix every detail route would look like a section, and the record crumb would
 * never render on the one screen it exists for. Stripping is done by segment, not
 * by regex, so a record whose id happens to read `en` still matches.
 */


/**
 * Static one-segment children of a section, which must never be read as a record
 * id. Derived from the sub-routes `lib/admin/nav-integrity.ts` declares, so there
 * is one list: `/admin/branding/colors` yields `colors`. The integrity test
 * already proves every declared sub-route exists on disk and is owned by a real
 * nav entry, so deriving here inherits those guarantees instead of restating them.
 */
export function staticSubRoutesOf(sectionPath: string): string[] {
  return SUB_ROUTES.filter((sub) => sub.ownedBy === sectionPath)
    .map((sub) => sub.path.slice(sectionPath.length + 1))
    // Dynamic routes are declared with a `{id}` placeholder; those are the
    // record pages themselves, never a static child to be mistaken for one.
    .filter((segment) => !segment.startsWith('{'))
}

function isStaticSubRoute(sectionPath: string, segment: string): boolean {
  return staticSubRoutesOf(sectionPath).includes(segment)
}


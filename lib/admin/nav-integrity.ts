/**
 * Nav integrity — the data the regression test asserts against.
 *
 * Why this exists: `ADMIN_NAV_SPECS` decides what a role SEES and each page's
 * `requireCapability` decides what it may OPEN. Nothing in the type system, the
 * linter or the build connects the two, so they drift silently in both
 * directions, and the failure is only ever visible to the person holding the
 * affected role:
 *
 *   • nav admits a capability the page's guard does not → the sidebar renders a
 *     link that bounces the operator to the not-authorized screen;
 *   • nav demands a capability no role holds → the section is invisible to
 *     everyone, including the role it was built for;
 *   • nav lists a path with no route → a 404.
 *
 * All three have happened here. `analyst`, `marketplace_admin` and
 * `media_admin` each held capabilities that matched no nav entry, so two roles
 * reached the screens they were named after only through someone else's
 * capability, and one role got a completely empty sidebar
 * (`ROLE_CAPABILITIES` in lib/auth/admin-roles.ts × `ADMIN_NAV_SPECS` — nothing
 * compared them). The any-of form that fixed those (`hasSpecCapability`) then
 * introduced the mirror-image bug: the Insights nav entry was widened to
 * `['viewDashboard', 'analytics.read']` while the page guard stayed
 * `requireCapability('viewDashboard')`, so an Analyst's only visible link
 * started bouncing them.
 *
 * This module holds the pairings as DATA so the test can check them without
 * parsing TypeScript, and without importing the nav (which pulls lucide
 * components into a node-environment suite for no reason).
 *
 * Keeping the list by hand rather than deriving it from `ADMIN_NAV_SPECS` is the
 * deliberate trade: the cost is a second place to edit; the benefit is that a
 * nav change CANNOT carry its own assertion along with it. The test compares the
 * two lists — editing `ADMIN_NAV_SPECS` without this file, or vice versa, turns
 * it red. That mutual check is the whole value; either list alone proves nothing.
 */
import type { Capability } from '@/lib/auth/capabilities'

/** How a page expresses its own guard. */
export type PageGuardShape =
  /** `requireCapability(c)` — exactly one capability, held required. */
  | { mode: 'single'; capability: Capability }
  /** `requireAnyCapability([...])` — any one of these is enough. */
  | { mode: 'any'; anyOf: Capability[] }

export type GuardedRoute = {
  /** Canonical, locale-free route the operator can land on. */
  path: string
  /** What the nav entry admits. */
  nav: Capability[]
  /** What the page's guard actually accepts. */
  page: PageGuardShape
}

/** The capability set a page guard requires, in the shape the rules compare. */
export function pageGuardCapabilities(shape: PageGuardShape): Capability[] {
  return shape.mode === 'single' ? [shape.capability] : shape.anyOf
}

const single = (capability: Capability): PageGuardShape => ({ mode: 'single', capability })
const anyOf = (...anyOf: Capability[]): PageGuardShape => ({ mode: 'any', anyOf })

/**
 * The guarded routes, verified against the guard on disk.
 *
 * `single` rows must match their nav capability EXACTLY — a wider guard than the
 * nav is a page anyone can reach by typing the URL while the menu hides it, and
 * a narrower one is a dead link. `any` rows must be a superset of the nav: every
 * capability the menu admits has to be accepted by the page, and every
 * capability the page accepts has to earn the operator some visible entry, or it
 * is a dead end reached only by guessing.
 */
export const GUARDED_ROUTES: GuardedRoute[] = [
  // Command
  { path: '/admin/dashboard', nav: ['viewDashboard'], page: single('viewDashboard') },
  { path: '/admin/inbox', nav: ['viewDashboard'], page: single('viewDashboard') },
  // The Analyst role exists to read analytics, so admitting `analytics.read` in
  // the nav is only honest once the page guard accepts it too.
  {
    path: '/admin/insights',
    nav: ['viewDashboard', 'analytics.read'],
    page: anyOf('viewDashboard', 'analytics.read'),
  },
  // Newsroom
  { path: '/admin/content', nav: ['manageContent'], page: single('manageContent') },
  { path: '/admin/emergency', nav: ['manageContent'], page: single('manageContent') },
  { path: '/admin/digest', nav: ['manageContent'], page: single('manageContent') },
  { path: '/admin/templates', nav: ['manageContent'], page: single('manageContent') },
  { path: '/admin/translations', nav: ['manageContent'], page: single('manageContent') },
  { path: '/admin/automations', nav: ['manageContent'], page: single('manageContent') },
  // Community
  { path: '/admin/moderation', nav: ['moderate'], page: single('moderate') },
  { path: '/admin/trust-safety', nav: ['moderate'], page: single('moderate') },
  { path: '/admin/polls', nav: ['managePolls'], page: single('managePolls') },
  { path: '/admin/fundraisers', nav: ['manageFundraisers'], page: single('manageFundraisers') },
  { path: '/admin/policies', nav: ['managePolicies'], page: single('managePolicies') },
  // Catalogue
  {
    path: '/admin/listings',
    nav: ['manageContent', 'listings.manage'],
    page: anyOf('manageContent', 'listings.manage'),
  },
  { path: '/admin/taxonomy', nav: ['manageContent'], page: single('manageContent') },
  { path: '/admin/media', nav: ['media.manage'], page: single('media.manage') },
  { path: '/admin/site-content', nav: ['manageSiteContent'], page: single('manageSiteContent') },
  { path: '/admin/branding', nav: ['branding.publish'], page: single('branding.publish') },
  { path: '/admin/ads', nav: ['manageAds'], page: single('manageAds') },
  // Platform
  { path: '/admin/users', nav: ['manageUsers'], page: single('manageUsers') },
  {
    path: '/admin/approvals',
    nav: ['secrets.revoke', 'incidents.manage', 'branding.publish', 'system.configure', 'manageUsers'],
    page: anyOf('secrets.revoke', 'incidents.manage', 'branding.publish', 'system.configure', 'manageUsers'),
  },
  { path: '/admin/incidents', nav: ['incidents.manage'], page: single('incidents.manage') },
  { path: '/admin/notifications', nav: ['manageNotifications'], page: single('manageNotifications') },
  // The supreme tier (docs/system/chief-access.md).
  { path: '/admin/states', nav: ['system.owner'], page: single('system.owner') },
  { path: '/admin/secrets', nav: ['system.owner'], page: single('system.owner') },
  { path: '/admin/storage-backup', nav: ['system.owner'], page: single('system.owner') },
  { path: '/admin/audit-log', nav: ['system.owner'], page: single('system.owner') },
  { path: '/admin/security', nav: ['system.owner'], page: single('system.owner') },
]

/* ------------------------------------------------------------------ */
/* "Can this viewer open that link?"                                   */
/* ------------------------------------------------------------------ */

/**
 * The capabilities that open a canonical admin path, taken from the nav's own
 * pairing — or null when no section owns the path, meaning there is no
 * nav-level requirement to apply (the page's guard is still the wall).
 * Longest owning entry wins.
 *
 * This is the single source for a question the shell asks a lot: it renders
 * links (attention rows, scheduler rows, alert rows) into screens not every
 * viewer can open. Answering it per surface with a hand-maintained list is how
 * those lists rot, and every one of them was a stale duplicate — a destination
 * moved to the supreme tier, or a row pointed at a section a given role never
 * sees, and the link started bouncing the operator to the not-authorized screen
 * from the one control that is supposed to be actionable. Deriving it from the
 * nav makes that structurally impossible: the same map that decides what the
 * sidebar SHOWS now decides what the shell may LINK.
 */
export function navCapabilitiesForPath(path: string): Capability[] | null {
  let best: GuardedRoute | null = null
  for (const route of GUARDED_ROUTES) {
    if (path !== route.path && !path.startsWith(`${route.path}/`)) continue
    if (!best || route.path.length > best.path.length) best = route
  }
  return best ? best.nav : null
}

/* ------------------------------------------------------------------ */
/* Routes that exist but are not nav entries                           */
/* ------------------------------------------------------------------ */

export type SubRoute = {
  /** The real on-disk path, relative to `app/[locale]` (route groups included). */
  file: string
  /** The canonical route it answers. */
  path: string
  /** The nav entry it belongs to for breadcrumbs + quick actions. */
  ownedBy: string
  /** What the sub-route's own page guard requires. */
  page: PageGuardShape
}

/**
 * Detail and action screens a breadcrumb or a palette jump can land on without
 * being navigable sections in their own right. Two rules keep them honest: the
 * file must exist, and a sub-route may never demand MORE than its owning
 * section admits — otherwise a role that can see Content could be bounced from a
 * page underneath it.
 */
export const SUB_ROUTES: SubRoute[] = [
  { file: 'admin/content/timeline/page.tsx', path: '/admin/content/timeline', ownedBy: '/admin/content', page: single('manageContent') },
  { file: 'admin/content/import/page.tsx', path: '/admin/content/import', ownedBy: '/admin/content', page: single('manageContent') },
  { file: 'admin/branding/colors/page.tsx', path: '/admin/branding/colors', ownedBy: '/admin/branding', page: single('branding.publish') },
  { file: 'admin/branding/new/page.tsx', path: '/admin/branding/new', ownedBy: '/admin/branding', page: single('branding.publish') },
  { file: 'admin/branding/assets/page.tsx', path: '/admin/branding/assets', ownedBy: '/admin/branding', page: single('branding.publish') },
  { file: 'admin/branding/[id]/page.tsx', path: '/admin/branding/{id}', ownedBy: '/admin/branding', page: single('branding.publish') },
  { file: 'admin/secrets/new/page.tsx', path: '/admin/secrets/new', ownedBy: '/admin/secrets', page: single('system.owner') },
  { file: 'admin/secrets/[id]/page.tsx', path: '/admin/secrets/{id}', ownedBy: '/admin/secrets', page: single('system.owner') },
  { file: 'admin/users/[id]/page.tsx', path: '/admin/users/{id}', ownedBy: '/admin/users', page: single('manageUsers') },
  { file: 'admin/incidents/[id]/page.tsx', path: '/admin/incidents/{id}', ownedBy: '/admin/incidents', page: single('incidents.manage') },
  { file: 'admin/moderation/[id]/page.tsx', path: '/admin/moderation/{id}', ownedBy: '/admin/moderation', page: single('moderate') },
]


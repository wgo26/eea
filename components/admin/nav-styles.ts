import { cn } from '@/lib/utils'
import type { AdminNavBadgeTone } from './nav-items'

/**
 * Presentation constants for the admin navigation, shared by the desktop
 * sidebar (`sidebar.tsx`) and the mobile drawer (`admin-mobile-nav.tsx`) so both
 * surfaces keep the same row metrics, active treatment and focus rings — the
 * drawer is the same menu on a smaller screen, not a second design.
 *
 * Surface note: the shell renders the nav on the sidebar surface (`--sidebar*`),
 * not on cards, so hover/active states use `sidebar-accent`. Those tokens are
 * theme-aware (light, dark, high-contrast), which is why an active row stays
 * legible everywhere while the brand cue is carried by the gold rail.
 */

/**
 * Row scale: `sidebar` = 36px ops density (matches the topbar's 36px controls),
 * `mobile` = 44px touch target in the drawer, `rail` = centered 40px icon row.
 */
export type AdminNavRowVariant = 'sidebar' | 'mobile' | 'rail'

const ROW_VARIANT: Record<AdminNavRowVariant, string> = {
  sidebar: 'min-h-9 px-3 py-1.5',
  mobile: 'min-h-11 px-3 py-2',
  rail: 'h-10 w-full justify-center px-0',
}

export function adminNavRowClass(active: boolean, variant: AdminNavRowVariant = 'sidebar'): string {
  return cn(
    'relative flex items-center gap-3 rounded-md text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    ROW_VARIANT[variant],
    active
      ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
      : 'font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  )
}

/** Brand-gold rail marking the current page inside an active row. */
export const ADMIN_NAV_ACTIVE_BAR_CLASS =
  'pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary'

/** Badge shell — 12px type is the documented legibility floor, never smaller. */
export const ADMIN_NAV_BADGE_CLASS =
  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums'

/**
 * Count severity: `alert` (destructive) is reserved for work that needs action
 * now — pending moderation. Informational counts (unread mail) stay neutral so
 * the sidebar has exactly one red thing in it when something is wrong.
 */
export function adminNavBadgeClass(tone: AdminNavBadgeTone = 'neutral'): string {
  return tone === 'alert' ? 'bg-destructive text-destructive-foreground' : 'bg-foreground/10 text-foreground'
}

/** Uppercase section / domain labels. */
export const ADMIN_NAV_SECTION_LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-wider text-muted-foreground'

/**
 * Collapsible domain header. Sticky so the label stays with its items while the
 * long groups (Editorial carries twelve entries) scroll, and it keeps the
 * sidebar surface behind it so rows never bleed through the label.
 */
export const ADMIN_NAV_DOMAIN_TOGGLE_CLASS = cn(
  ADMIN_NAV_SECTION_LABEL_CLASS,
  'sticky top-0 z-10 flex w-full items-center gap-1 rounded-md bg-sidebar/95 px-3 py-1.5 backdrop-blur transition-colors hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
)

/**
 * Rail toggle shortcut (Cmd/Ctrl+B, the shadcn sidebar convention). Declared
 * here rather than next to one of the two triggers — the sidebar footer and the
 * topbar header both drive the same preference store, and they must never
 * advertise a different glyph or ARIA descriptor.
 */
export const RAIL_SHORTCUT_KEY = 'b'
export const SHORTCUT_MODIFIER = '⌘/Ctrl'
export const SHORTCUT_KEY_LABEL = 'B'
/** ARIA `aria-keyshortcuts` descriptor for the same binding. */
export const SHORTCUT_ATTR = 'Control+B Meta+B'

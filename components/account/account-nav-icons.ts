import type { ComponentType } from 'react'
import {
  Bell,
  BellRing,
  Bookmark,
  History,
  LayoutDashboard,
  Lock,
  MessageCircle,
  Package,
  Send,
  UserRound,
} from 'lucide-react'
import type { AccountNavItemKey } from '@/lib/account/nav'

/**
 * Icon registry for the account nav (the view half of `lib/account/nav.ts`).
 *
 * Kept out of the nav module so the nav's grouping/breadcrumb logic stays
 * dependency-free and unit-testable — the same split the admin shell uses
 * between its data specs and its presentation. Lookups are by nav key, so a
 * renamed section cannot silently lose its icon.
 */
export const ACCOUNT_NAV_ICONS: Record<AccountNavItemKey, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  submissions: Send,
  listings: Package,
  messages: MessageCircle,
  saved: Bookmark,
  follows: BellRing,
  recent: History,
  profile: UserRound,
  notifications: Bell,
  security: Lock,
}

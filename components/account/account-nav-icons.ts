import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Megaphone,
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
 * renamed section cannot silently lose its icon. P2 trims the registry with
 * the nav (5 destinations); the removed icons ship with lucide anyway.
 */
export const ACCOUNT_NAV_ICONS: Record<AccountNavItemKey, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  submissions: Send,
  listings: Package,
  notices: Megaphone,
  profile: UserRound,
}

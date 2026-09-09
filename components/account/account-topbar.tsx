import Link from 'next/link'
import { Eye, LayoutDashboard, LogOut, PenLine, ShieldCheck } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath } from '@/lib/i18n/urls'
import { getSessionUser } from '@/lib/auth/guards'
import { getUserRoles, isStaffRoles } from '@/lib/auth/roles'
import { signOutAction } from '@/lib/auth/actions'
import { AccountTopbarNav } from './account-topbar-nav'

/**
 * Account AppShell topbar (checklist items 7 + 11): the logged-in area's
 * primary nav — dashboard, submit shortcut, admin workspace for staff —
 * plus the profile area with sign-out, so it's on every account page.
 * Sticky on mobile with horizontally scrollable touch-sized tabs.
 */
export async function AccountTopbar() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const { supabase, user } = await getSessionUser()
  const roles = user ? await getUserRoles(supabase, user.id) : []
  const isStaff = isStaffRoles(roles)
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    ''

  const tabs = [
    {
      href: localePath(locale, '/account/dashboard'),
      label: dict.account.topbar.dashboard,
      icon: LayoutDashboard,
    },
    {
      href: localePath(locale, '/submit'),
      label: dict.account.topbar.submit,
      icon: PenLine,
    },
    ...(isStaff
      ? [
          {
            href: localePath(locale, '/admin/dashboard'),
            label: dict.account.topbar.adminWorkspace,
            icon: ShieldCheck,
          },
        ]
      : []),
  ]

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
        <Link
          href={localePath(locale, '/account/dashboard')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          aria-label={dict.account.topbar.dashboard}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Eye className="h-4 w-4" aria-hidden />
          </span>
        </Link>

        <AccountTopbarNav tabs={tabs} />

        <div className="flex shrink-0 items-center gap-2 border-l border-border pl-2">
          <div className="hidden text-right leading-tight md:block">
            <div className="max-w-[14rem] truncate text-sm font-medium">{displayName}</div>
          </div>
          <Link
            href={localePath(locale, '/')}
            className="inline-flex min-h-[36px] items-center rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {dict.account.topbar.viewSite}
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{dict.account.topbar.signOut}</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
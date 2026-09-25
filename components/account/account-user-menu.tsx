'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { signOutAction } from '@/lib/auth/actions'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'

/**
 * Member identity area (Account audit §2.1): the name + "View site" +
 * sign-out row that used to sit next to ten flat tabs is now one avatar
 * menu, matching AdminUserMenu in the admin shell. The menu carries the
 * full identity (name, email, role), quick destinations, the public
 * contributor page, the admin workspace for staff, and sign-out.
 *
 * The grouped Library / Settings destinations live in the topbar "More"
 * dropdown and the mobile drawer — duplicating them here as well would put
 * the same link in two menus with no clear owner.
 *
 * Sign-out calls the server action directly: submitting a form from inside a
 * menu item breaks focus management mid-navigation, and the action redirects
 * itself on completion.
 */
export function AccountUserMenu({
  displayName,
  email,
  initials,
  roleLabel,
  isStaff,
  avatarUrl,
  publicProfileHref,
}: {
  displayName: string
  email: string
  initials: string
  roleLabel: string
  isStaff: boolean
  avatarUrl?: string | null
  /** Set only when the member keeps a public contributor page. */
  publicProfileHref?: string
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const router = useRouter()
  const t = dict.account.topbar

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${displayName} — ${t.menu}`}
            className={cn(
              'inline-flex h-9 min-h-9 items-center gap-2 rounded-full border border-border bg-background p-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'sm:pl-1.5 sm:pr-2.5',
            )}
          >
            <Avatar size="sm">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials || <UserRound className="h-3.5 w-3.5" aria-hidden />}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{displayName}</span>
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {roleLabel}
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={localePath(locale, '/account/dashboard')} />}>
          <LayoutDashboard />
          {t.dashboard}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={localePath(locale, '/account/profile')} />}>
          <UserRound />
          {t.profile}
        </DropdownMenuItem>
        {publicProfileHref ? (
          <DropdownMenuItem render={<Link href={publicProfileHref} />}>
            <ExternalLink />
            {t.publicProfile}
          </DropdownMenuItem>
        ) : null}
        {isStaff ? (
          <DropdownMenuItem render={<Link href={localePath(locale, '/admin/dashboard')} />}>
            <ShieldCheck />
            {t.adminWorkspace}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={localePath(locale, '/')} />}>
          <ExternalLink />
          {t.viewSite}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void signOutAction().catch(() => router.refresh())
          }}
        >
          <LogOut />
          {t.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, ExternalLink, LayoutDashboard, LogOut, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { signOutAction } from '@/lib/auth/actions'
import type { AppRole } from '@/lib/auth/types'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'

/**
 * Staff identity area (Phase A): replaces the cramped avatar + name + email +
 * sign-out row in the topbar with one popover menu. The trigger is a compact
 * avatar chip (hidden name on small screens); the menu carries the full
 * identity (name, email, role badge), quick links, and sign-out.
 *
 * Sign-out is a direct server-action call from the menu item. The action
 * redirects itself on success; if the promise rejects anyway (a digest Next
 * has already consumed, or a transport failure), `router.refresh()` re-runs
 * the layout guards — a signed-out staff member then lands on the localized
 * login screen instead of stranded admin chrome.
 */
export function AdminUserMenu({
  displayName,
  email,
  roles,
}: {
  displayName: string
  email: string
  roles: AppRole[]
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const router = useRouter()
  const initials = displayName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const isAdmin = roles.includes('admin')
  const isEditor = roles.includes('editor')

  const roleLabel = isAdmin
    ? dict.account.dashboard.roleAdmin
    : isEditor
      ? dict.account.dashboard.roleEditor
      : dict.account.dashboard.member

  const roleTone = isAdmin
    ? 'bg-primary/10 text-primary'
    : isEditor
      ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
      : 'bg-muted text-muted-foreground'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={displayName}
            className={cn(
              'inline-flex h-9 min-h-9 items-center gap-2 rounded-full border border-border bg-background pl-1 pr-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'sm:pl-1.5 sm:pr-2.5',
            )}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials || <Settings className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{displayName}</span>
            <ChevronsUpDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', roleTone)}>
              {roleLabel}
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={localePath(locale, '/admin/dashboard')} />}>
          <LayoutDashboard />
          {dict.admin.sidebar.dashboard}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={localePath(locale, '/account')} />}>
          <Settings />
          {dict.account.topbar.profile}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={localePath(locale, '/')} target="_blank" />}>
          <ExternalLink />
          {dict.account.topbar.viewSite}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void signOutAction().catch(() => router.refresh())
          }}
        >
          <LogOut />
          {dict.admin.topbar.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

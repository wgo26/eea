'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, LayoutDashboard, LogOut, Settings, ShieldCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { signOutAction } from '@/lib/auth/actions'
import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_TIER,
  topTierRole,
  type AdminRole,
  type AdminRoleTier,
} from '@/lib/auth/admin-roles'
import type { Capability } from '@/lib/auth/capabilities'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'

/**
 * Who you are (AppShell identity).
 *
 * This replaces the chip that derived its label from the LEGACY `app_role` enum
 * alone: a Chief Administrator, a Platform Administrator and an Analyst all read
 * the word "Member" on their own console, because `user_admin_roles` never
 * reached the UI. The grant is a SET, so the chip names the person by their
 * highest tier (`topTierRole`) and shows the remainder as a "+N" overflow, and
 * the menu states the reach that tier buys — sections visible, approvals waiting
 * on them, and whether they hold the supreme `system.owner` tier that
 * docs/system/chief-access.md documents.
 *
 * Deliberately READ-ONLY. Chief access is SQL-only on purpose so it can never be
 * reached by a compromised staff session; nothing here grants anything, and the
 * names come from the same role map the guards resolve against.
 */

/** Tier → badge tone. Colour is decoration; the label always carries the text. */
const TIER_BADGE: Record<AdminRoleTier, string> = {
  supreme: 'bg-primary/15 text-primary ring-1 ring-primary/30',
  executive: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  operational: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  analytical: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

export function AdminIdentity({
  displayName,
  email,
  adminRoles,
  capabilities,
  sectionsVisible,
  sectionsTotal,
  approvalsAwaiting,
}: {
  displayName: string
  email: string
  /** Resolved spec §17 roles (already aliased by `resolveAdminRoles`). */
  adminRoles: AdminRole[]
  capabilities: Set<Capability>
  sectionsVisible: number
  sectionsTotal: number
  approvalsAwaiting: number
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const router = useRouter()
  const roles = dict.admin.roles

  const initials = displayName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // No admin-role rows: the coarse gate admitted them as an editor, which is the
  // only honest thing left to say. Never "Member" — that is the bug this fixes.
  const primary = topTierRole(adminRoles)
  const label = primary ? roles[primary] : dict.account.dashboard.roleEditor
  const tone = primary ? TIER_BADGE[ADMIN_ROLE_TIER[primary]] : 'bg-muted text-muted-foreground'
  const others = primary ? adminRoles.filter((role) => role !== primary) : []
  const isSupreme = capabilities.has('system.owner')

  const digest = [
    dict.admin.topbar.sectionsVisible
      .replace('{count}', String(sectionsVisible))
      .replace('{total}', String(sectionsTotal)),
    approvalsAwaiting > 0
      ? dict.admin.topbar.approvalsAwaiting.replace('{count}', String(approvalsAwaiting))
      : dict.admin.topbar.noApprovals,
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${displayName} — ${label}`}
            className="inline-flex h-9 min-h-9 items-center gap-2 rounded-full border border-border bg-background pl-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-2.5"
          >
            <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials || <Settings className="h-3.5 w-3.5" aria-hidden />}
              {isSupreme && (
                <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-card p-px">
                  <ShieldCheck
                    className="h-3 w-3 text-primary"
                    role="img"
                    aria-label={dict.admin.topbar.supremeAccess}
                  />
                </span>
              )}
            </span>
            <span className="hidden max-w-[9rem] flex-col items-start sm:flex">
              <span className="max-w-full truncate text-sm font-medium leading-4">{displayName}</span>
              <span className={cn('mt-0.5 max-w-full truncate rounded-full px-1.5 text-xs font-medium leading-4', tone)}>
                {label}
              </span>
            </span>
            {others.length > 0 && (
              <span className="hidden shrink-0 rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground sm:inline">
                +{others.length}
              </span>
            )}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            <span className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', tone)}>
              {label}
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
          {others.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="w-fit cursor-default text-xs text-muted-foreground underline decoration-dotted" />
                }
              >
                +{others.length} {dict.admin.topbar.signedInAs.toLowerCase()}
              </TooltipTrigger>
              {/* English canonical names, matching ADMIN_ROLE_LABELS the guards
                  and approval errors quote — the localized chip is the badge,
                  this is the audit-grade list. */}
              <TooltipContent side="bottom" className="max-w-56">
                {others.map((role) => ADMIN_ROLE_LABELS[role]).join(' · ')}
              </TooltipContent>
            </Tooltip>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-1 px-2 py-1.5 text-xs text-muted-foreground">
          {digest.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {isSupreme && (
            <p className="flex items-center gap-1.5 font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {dict.admin.topbar.supremeAccess}
            </p>
          )}
        </div>
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
            // The action redirects on success. If the promise rejects (a digest
            // Next already consumed, a transport failure), refreshing re-runs the
            // layout guards so a signed-out staffer lands on the localized login
            // screen instead of stranded admin chrome.
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

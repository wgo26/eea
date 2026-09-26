'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { type AppRole } from '@/lib/auth/types'
import { type AdminRole } from '@/lib/auth/admin-roles'
import { type AdminShellContext } from '@/lib/admin/shell-context'
import { useLocaleFromPath } from '@/components/site-header'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AdminMobileNav } from './admin-mobile-nav'
import { AdminCommandPalette } from './admin-command-palette'
import { AdminIdentity } from './admin-identity'
import { AdminAttention } from './admin-attention'
import { AdminQuickActions } from './admin-quick-actions'
import { AdminPreferences } from './admin-preferences'
import { SystemStateIndicator } from './system-state-indicator'
import { useSystemState } from './state-provider'
import { useRecentPaths, useSidebarRail } from './nav-preferences'
import { EnvIndicator } from './env-indicator'
import { ADMIN_NAV_TOTAL, buildAdminNavGroups } from './nav-items'
import { AdminBreadcrumbs } from './admin-breadcrumbs'
import { SHORTCUT_ATTR, SHORTCUT_KEY_LABEL, SHORTCUT_MODIFIER } from './nav-styles'

/**
 * Admin topbar (AppShell). Client component so the capability-filtered nav
 * groups — which carry icon component references — can be built on the client;
 * constructing them in a Server Component and passing them to the mobile nav or
 * the palette would ship functions across the boundary (React #441).
 *
 * Four interactive things, and deliberately no more: START work (quick actions),
 * FIND anything (⌘K), SEE what waits (attention), KNOW who you are (identity).
 * Preferences takes the only fifth slot, because theme / language / density are
 * per-device controls an operator reaches for mid-task.
 *
 * The layout resolves `shell` once per request (lib/admin/queries/shell.ts), so
 * this component never queries. Alerts, scheduler rows and approval counts
 * arrive already filtered by capability, so everything rendered here is a screen
 * the viewer can actually open.
 */
export function AdminTopbar({
  roles,
  adminRoles = [],
  shell,
  displayName,
  email,
  logoUrl = null,
}: {
  roles: AppRole[]
  adminRoles?: AdminRole[]
  shell: AdminShellContext
  displayName: string
  email: string
  logoUrl?: string | null
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const groups = buildAdminNavGroups(
    locale,
    dict,
    roles,
    shell.pendingSubmissions,
    adminRoles,
    shell.unreadNotifications,
  )
  const items = groups.flatMap((group) => group.items)
  const systemState = useSystemState()
  const { rail, toggleRail } = useSidebarRail()
  const { paths } = useRecentPaths()

  // Section-state chips for the breadcrumb, keyed by canonical path. Both values
  // are ones the layout already resolved — this renders them beside the section
  // they describe rather than issuing a fresh read.
  const topbarCopy = dict.admin.topbar
  const sectionState: Record<string, { count: number; label: string } | undefined> = {
    '/admin/moderation': { count: shell.pendingSubmissions, label: topbarCopy.waitingShort },
    '/admin/content': { count: shell.org.overdueScheduled, label: topbarCopy.overdueShort },
  }

  // Recents persist as locale-free paths and resolve against the CURRENT visible
  // nav, so revoking a capability or switching language can never leave a stale
  // or unauthorized entry in the menu.
  const byPath = new Map(items.map((item) => [item.path, item]))
  const recents = paths.flatMap((path) => {
    const item = byPath.get(path)
    return item ? [item] : []
  })

  const dashboardHref = localePath(locale, '/admin/dashboard')
  const collapseLabel = rail ? dict.admin.sidebar.expandNav : dict.admin.sidebar.collapseNav

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-4 lg:px-6">
        {/* Left zone — navigation affordances + active context. */}
        <AdminMobileNav
          groups={groups}
          backToSiteHref={localePath(locale, '/')}
          logoUrl={logoUrl}
          labels={{
            menu: dict.admin.topbar.menu,
            backToSite: dict.admin.sidebar.backToSite,
            brand: dict.admin.sidebar.brand,
            consoleLabel: dict.admin.sidebar.consoleLabel,
          }}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={toggleRail}
                aria-label={collapseLabel}
                aria-keyshortcuts={SHORTCUT_ATTR}
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
              >
                {rail ? (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden />
                ) : (
                  <PanelLeftClose className="h-4 w-4" aria-hidden />
                )}
              </button>
            }
          />
          <TooltipContent side="bottom">
            {collapseLabel}
            <Kbd>{SHORTCUT_MODIFIER}</Kbd>
            <Kbd>{SHORTCUT_KEY_LABEL}</Kbd>
          </TooltipContent>
        </Tooltip>

        <AdminBreadcrumbs groups={groups} sectionState={sectionState} />

        {/* Center zone — global search. ⌘K works from anywhere in the shell. */}
        <div className="flex min-w-0 flex-1 justify-center md:flex-none">
          <AdminCommandPalette groups={groups} />
        </div>

        {/* Right zone — start, status, attention, identity. */}
        <div className="flex shrink-0 items-center gap-2">
          <AdminQuickActions items={items} recents={recents} />

          <EnvIndicator locale={locale} className="hidden 2xl:inline-flex" />
          {systemState && (
            <SystemStateIndicator
              label={dict.admin.states.label}
              name={systemState.name}
              tone={systemState.tone}
              href={systemState.href}
            />
          )}

          <AdminAttention
            alerts={shell.alerts}
            schedulerIssues={shell.schedulerIssues}
            pendingSubmissions={shell.pendingSubmissions}
            unreadNotifications={shell.unreadNotifications}
            actionableApprovals={shell.actionableApprovals}
            overdueScheduled={shell.org.overdueScheduled}
            dashboardHref={dashboardHref}
          />

          <AdminPreferences />

          <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />

          <AdminIdentity
            displayName={displayName}
            email={email}
            adminRoles={adminRoles}
            capabilities={shell.capabilities}
            sectionsVisible={items.length}
            sectionsTotal={ADMIN_NAV_TOTAL}
            approvalsAwaiting={shell.actionableApprovals}
          />
        </div>
      </div>
    </header>
  )
}

import type { ReactNode } from 'react'
import { requireStaff } from '@/lib/auth/guards'
import { getAdminDisplayName } from '@/lib/admin/identity'
import { getAdminRoles } from '@/lib/auth/roles'
import { effectiveCapabilities, resolveAdminRoles } from '@/lib/auth/admin-roles'
import { getAdminShellContext } from '@/lib/admin/shell-context'
import { getAuditRetentionDays } from '@/lib/security/audit-retention'
import { getActiveStates, getActiveIncident, getPublicSiteSettings } from '@/lib/admin/queries'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import {
  NORMAL_STATE_ID,
  getEffectiveState,
  getStateVisualProfile,
  stateTokenStyle,
} from '@/lib/platform/state-engine'
import { ensurePluginStatesRegistered } from '@/lib/platform/states/index'
import { stateNameKey } from '@/lib/platform/state-presentation'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminTopbar } from '@/components/admin/topbar'
import { AdminFooter } from '@/components/admin/admin-footer'
import { SkipLink } from '@/components/system/skip-link'
import { AdminClientWrapper } from '@/components/admin/admin-client-wrapper'
import { AdminErrorBoundary } from '@/components/admin/error-boundary'
import { StateBanner } from '@/components/admin/state-banner'
import { SystemStateProvider } from '@/components/admin/state-provider'
import { appMono } from '../fonts'

// Every page under /admin (both locales — this layout lives in the [locale]
// tree) inherits the staff guard automatically, closing the /en/admin/*
// bypass (P0-2). Admin-only actions inside these pages still call
// requireAdmin()/assertAdmin() where admin vs editor matters.
export const metadata = {
  robots: { index: false, follow: false },
}

/**
 * The admin shell is per-user and per-session, so it is never prerendered.
 *
 * Until now it was dynamic only by accident: `proxy.ts` awaits
 * `updateSession()` on every request and that touches cookies, which happens to
 * opt the whole tree out of static rendering. An emergent property of a
 * middleware file is not a contract — the shell now also reads
 * `getSessionAssurance()`, another cookie-scoped value, and a future change to
 * the proxy could silently turn an admin page into static HTML carrying one
 * operator's unread counts and 2FA standing inside another operator's response.
 * Stated here, that cannot happen quietly.
 */
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Plugin manifests register idempotently per request so precedence and
  // behavior resolve for every admin surface, not just the states tab.
  ensurePluginStatesRegistered()
  const { supabase, user, roles } = await requireStaff('/admin/dashboard')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  // Menu/tone decisions use the union of the legacy app_role layer and the
  // fine-grained `user_admin_roles` layer (Phase 2.1), so a platform_admin
  // without a legacy `admin` row still sees the entries they can operate.
  const adminRoles = await getAdminRoles(supabase, user.id)
  const caps = effectiveCapabilities(roles, adminRoles)
  // One pass resolves everything the AppShell renders: the badge counts the
  // sidebar needs, the derived operational alerts, the scheduler's health, the
  // approvals this viewer can decide and this session's 2FA assurance.
  // Alert/scheduler reads are org-wide and degrade to empty rather than throwing,
  // so the shell renders during an outage instead of taking the page down with it
  // (see lib/admin/queries/shell.ts; the assurance read and the freshness
  // contract are in lib/admin/shell-context.ts).
  const [shell, states] = await Promise.all([
    getAdminShellContext({ userId: user.id, roles, adminRoles }),
    getActiveStates(),
  ])
  const pendingCount = shell.pendingSubmissions
  const unreadNotifications = shell.unreadNotifications

  // Spec §30: State → Semantic Tokens → Design System → Components. The
  // effective state resolves once per request here; the tokens ride the
  // existing CSS custom properties and `data-system-state` is the hook for
  // state-scoped rules (`data-state-motion` kills nonessential motion, §25).
  const effectiveState = getEffectiveState(states)
  const stateProfile = getStateVisualProfile(effectiveState.id)
  const stateName = dict.admin.states[stateNameKey(effectiveState.id)]
  const isNormal = effectiveState.id === NORMAL_STATE_ID
  const canManageIncidents = caps.has('incidents.manage')
  // Supreme tier: the state pill + operational-controls links point at the
  // chief-only states tab. `system.configure` holders (super/platform admin)
  // keep incident-console access via canManageIncidents but no ladder link.
  const canConfigureStates = caps.has('system.owner')
  const incident = isNormal ? null : await getActiveIncident()
  const incidentHref = incident && canManageIncidents ? localePath(locale, `/admin/incidents/${incident.id}`) : undefined
  // Where the state pill points: the incident driving an operational state,
  // else the operational controls the viewer can actually use (spec §28).
  const stateHref =
    incidentHref ??
    (canConfigureStates
      ? localePath(locale, '/admin/states')
      : canManageIncidents
        ? localePath(locale, '/admin/incidents')
        : undefined)
  const controlsHref = canConfigureStates
    ? localePath(locale, '/admin/states')
    : canManageIncidents
      ? localePath(locale, '/admin/incidents')
      : undefined

  // The edited name lives in `profiles.display_name`; auth metadata is only
  // the signup-time fallback (see lib/admin/identity.ts).
  const displayName = await getAdminDisplayName(user)
  const siteSettings = await getPublicSiteSettings()

  return (
    <AdminClientWrapper>
      <SystemStateProvider
        state={{
          id: effectiveState.id,
          name: stateName,
          tone: stateProfile.tone,
          statusLabel: stateProfile.statusLabel,
          href: stateHref,
        }}
        tokens={stateTokenStyle(effectiveState.id)}
        reduceMotion={stateProfile.reduceMotion}
        className={`flex min-h-dvh overflow-x-clip bg-muted/30 ${appMono.variable}`}
      >
        {/* Keyboard bypass past the sidebar + topbar chrome (Phase 6). The admin
            shell has more tab stops before the content than any other surface in
            the product — sidebar, collapse toggle, mobile drawer, quick actions,
            palette, attention, preferences, identity — so this is the shell that
            needed it most, and it did not have one. */}
        <SkipLink locale={locale} />
        <div className="hidden lg:block">
          <div className="sticky top-0 h-screen">
            <AdminSidebar
              pendingCount={pendingCount}
              roles={roles}
              adminRoles={adminRoles}
              unreadNotifications={unreadNotifications}
              logoUrl={siteSettings.logoUrl}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar
            roles={roles}
            adminRoles={resolveAdminRoles(roles, adminRoles)}
            shell={shell}
            displayName={displayName}
            email={user.email ?? ''}
            logoUrl={siteSettings.logoUrl}
          />
          {!isNormal && (
            <StateBanner
              locale={locale}
              stateName={stateName}
              tone={stateProfile.tone}
              controlsHref={controlsHref}
              labels={dict.admin.states}
              incident={
                incident
                  ? {
                      ref: incident.ref,
                      title: incident.title,
                      description: incident.publicStatusMessage ?? incident.description,
                      owner: incident.owner,
                      startedAt: incident.startTime,
                      updatedAt: incident.updatedAt,
                      href: incidentHref,
                    }
                  : null
              }
            />
          )}
          {/* `id` + `tabIndex` are the SkipLink's target: see
              components/system/skip-link.tsx for why a target with no tabindex
              leaves focus on the link instead of in the page. */}
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
            <AdminErrorBoundary
              title={dict.admin.common.sectionErrorTitle}
              message={dict.admin.common.sectionErrorBody}
              retryLabel={dict.admin.common.sectionErrorRetry}
              dashboardLabel={dict.admin.common.sectionErrorBack}
              dashboardHref={localePath(locale, '/admin/dashboard')}
            >
              {children}
            </AdminErrorBoundary>
          </main>
          <AdminFooter
            locale={locale}
            assurance={shell.assurance}
            schedulerIssueCount={shell.schedulerIssues.length}
            canSeeScheduler={caps.has('system.owner')}
            retentionDays={getAuditRetentionDays()}
          />
        </div>
      </SystemStateProvider>
    </AdminClientWrapper>
  )
}

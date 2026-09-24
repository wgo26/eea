import type { ReactNode } from 'react'
import { requireStaff } from '@/lib/auth/guards'
import { getAdminRoles } from '@/lib/auth/roles'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import { getPendingSubmissionCount, getActiveStates, getActiveIncident, getUnreadNotificationTotal } from '@/lib/admin/queries'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import {
  NORMAL_STATE_ID,
  getEffectiveState,
  getStateVisualProfile,
  stateTokenStyle,
} from '@/lib/platform/state-engine'
import { stateNameKey } from '@/lib/platform/state-presentation'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminTopbar } from '@/components/admin/topbar'
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

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { supabase, user, roles } = await requireStaff('/admin/dashboard')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  // Menu/tone decisions use the union of the legacy app_role layer and the
  // fine-grained `user_admin_roles` layer (Phase 2.1), so a platform_admin
  // without a legacy `admin` row still sees the entries they can operate.
  const adminRoles = await getAdminRoles(supabase, user.id)
  const caps = effectiveCapabilities(roles, adminRoles)
  const [pendingCount, states, unreadNotifications] = await Promise.all([
    // Badge-only micro-query: the layout never reads the other 11 stat
    // queries, so the full getDashboardStats() fan-out stays on the
    // dashboard page itself.
    getPendingSubmissionCount(),
    getActiveStates(),
    // Spec §38: the sidebar badge is the recipient's own unread mail count.
    getUnreadNotificationTotal(user.id),
  ])

  // Spec §30: State → Semantic Tokens → Design System → Components. The
  // effective state resolves once per request here; the tokens ride the
  // existing CSS custom properties and `data-system-state` is the hook for
  // state-scoped rules (`data-state-motion` kills nonessential motion, §25).
  const effectiveState = getEffectiveState(states)
  const stateProfile = getStateVisualProfile(effectiveState.id)
  const stateName = dict.admin.states[stateNameKey(effectiveState.id)]
  const isNormal = effectiveState.id === NORMAL_STATE_ID
  const canManageIncidents = caps.has('incidents.manage')
  const canConfigureStates = caps.has('system.configure')
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

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    'Staff'

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
        className={`flex min-h-screen bg-muted/30 ${appMono.variable}`}
      >
        <div className="hidden lg:block">
          <div className="sticky top-0 h-screen">
            <AdminSidebar
              pendingCount={pendingCount}
              roles={roles}
              adminRoles={adminRoles}
              unreadNotifications={unreadNotifications}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar
            pendingCount={pendingCount}
            roles={roles}
            adminRoles={adminRoles}
            displayName={displayName}
            email={user.email ?? ''}
            unreadNotifications={unreadNotifications}
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
          <main className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
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
        </div>
      </SystemStateProvider>
    </AdminClientWrapper>
  )
}

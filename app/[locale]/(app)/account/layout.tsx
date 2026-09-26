import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth/guards'
import { getRequestLocale } from '@/lib/i18n/server'
import { getAccountIdentity } from '@/lib/account/identity'
import { getPublicSiteSettings } from '@/lib/admin/queries'
import { AccountTopbar } from '@/components/account/account-topbar'
import { SkipLink } from '@/components/system/skip-link'
import { ToastProvider } from '@/components/admin/toast'
import { appMono } from '../fonts'

/**
 * Account AppShell (checklist item 2): topbar + content for the logged-in
 * member area. Guards the whole branch (dashboard + any future account
 * pages) and never renders with public chrome.
 *
 * Identity (name, role, avatar, unread count) resolves once per request here
 * and is passed to the topbar as plain data — the topbar is a client
 * component because its nav carries icon references, so it cannot query.
 */
export const metadata = {
  robots: { index: false, follow: false },
}

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser('/account/dashboard')
  const locale = await getRequestLocale()
  const identity = await getAccountIdentity(user, locale)
  const siteSettings = await getPublicSiteSettings()

  return (
    <div className={`min-h-dvh overflow-x-clip bg-muted/30 ${appMono.variable}`}>
      {/* ProfileForm posts success/failure through the shared admin toast host,
          which has to exist in this tree — /account/profile crashed straight
          into the error boundary with "useToast must be used within
          ToastProvider". Same wrapper the admin shell uses. */}
      <ToastProvider>
        <SkipLink locale={locale} />
        <AccountTopbar
          displayName={identity.displayName}
          email={identity.email}
          roleLabel={identity.roleLabel}
          roles={identity.roles}
          avatarUrl={identity.avatarUrl}
          publicProfileHref={identity.publicProfileHref}
          unreadNotifications={identity.unreadNotifications}
          logoUrl={siteSettings.logoUrl}
        />
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
      </ToastProvider>
    </div>
  )
}
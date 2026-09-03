import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth/guards'
import { AccountTopbar } from '@/components/account/account-topbar'

/**
 * Account AppShell (checklist item 2): topbar + content for the logged-in
 * member area. Guards the whole branch (dashboard + any future account
 * pages) and never renders with public chrome.
 */
export const metadata = {
  robots: { index: false, follow: false },
}

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireUser('/account/dashboard')

  return (
    <div className="min-h-screen bg-muted/30">
      <AccountTopbar />
      {children}
    </div>
  )
}
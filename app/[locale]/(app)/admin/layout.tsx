import type { ReactNode } from 'react'
import { requireStaff } from '@/lib/auth/guards'
import { getDashboardStats } from '@/lib/admin/queries'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminTopbar } from '@/components/admin/topbar'
import { AdminClientWrapper } from '@/components/admin/admin-client-wrapper'

// Every page under /admin (both locales — this layout lives in the [locale]
// tree) inherits the staff guard automatically, closing the /en/admin/*
// bypass (P0-2). Admin-only actions inside these pages still call
// requireAdmin()/assertAdmin() where admin vs editor matters.
export const metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, roles } = await requireStaff('/admin/dashboard')
  const stats = await getDashboardStats()
  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    'Staff'

  return (
    <AdminClientWrapper>
      <div className="flex min-h-screen bg-muted/30">
        <div className="hidden lg:block">
          <div className="sticky top-0 h-screen">
            <AdminSidebar pendingCount={stats.pendingSubmissions} roles={roles} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar
            pendingCount={stats.pendingSubmissions}
            roles={roles}
            displayName={displayName}
            email={user.email ?? ''}
          />
          <main className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </AdminClientWrapper>
  )
}

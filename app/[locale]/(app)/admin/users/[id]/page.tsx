import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getUserDetail } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { formatDateTime } from '@/lib/admin/format'
import { UserActions } from '../user-actions'
import { DangerZone, RoleManager, StatusControls } from './user-detail-client'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<{ title: string }> {
  const { id } = await params
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const detail = await getUserDetail(id).catch(() => null)
  const name = detail?.user.displayName ?? detail?.user.fullName ?? detail?.user.email ?? dict.admin.users.title
  return { title: name }
}

/**
 * User detail (preview) page: clicking a row in /admin/users lands here.
 * Profile header, role manager (add/remove with admin reauth), account
 * status controls, recent activity with moderation deep-links, and the
 * delete danger zone. The row ⋯ menu stays available as overflow actions.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireCapability('manageUsers', '/admin/users')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.users

  const detail = await getUserDetail(id)
  if (!detail) notFound()
  const { user, submissions, submissionCount, content, contentCount } = detail

  const displayName = user.displayName ?? user.fullName ?? user.email ?? t.unnamed
  const statusKey = user.isBanned ? 'banned' : user.isSuspended ? 'suspended' : 'active'
  const statusLabel = statusKey === 'banned' ? t.statusBanned : statusKey === 'suspended' ? t.statusSuspended : t.statusActive

  return (
    <div className="space-y-5">
      <Link
        href={localePath(locale, '/admin/users')}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span aria-hidden="true">←</span> {t.backToUsers}
      </Link>

      <PageHeader
        title={displayName}
        description={user.email ?? undefined}
        actions={<UserActions user={user} copy={t} common={dict.admin.common} />}
      />

      {/* Profile preview */}
      <section aria-label={t.profileHeading} className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover bg-muted shrink-0" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-medium text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={statusKey} label={statusLabel} />
              <StatusBadge
                status={user.isVerified ? 'verified' : 'unverified'}
                label={user.isVerified ? t.verified : t.unverified}
              />
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t.detailEmail}</dt>
                <dd className="min-w-0 truncate font-medium">{user.email ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t.detailPhone}</dt>
                <dd className="font-medium">{user.phone ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t.detailLocation}</dt>
                <dd className="font-medium">{user.locationName ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{t.detailJoined}</dt>
                <dd className="font-medium">{user.createdAt ? formatDateTime(user.createdAt) : '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Roles — add/remove with reauth for admin */}
        <section aria-label={t.rolesHeading} className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">{t.rolesHeading}</h2>
          <div className="mt-3">
            <RoleManager user={user} copy={t} common={dict.admin.common} />
          </div>
        </section>

        {/* Account status */}
        <section aria-label={t.statusHeading} className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">{t.statusHeading}</h2>
          <div className="mt-3">
            <StatusControls user={user} copy={t} common={dict.admin.common} />
          </div>
        </section>
      </div>

      {/* Activity */}
      <section aria-label={t.activityHeading} className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{t.activityHeading}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{t.statSubmissions}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{submissionCount}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{t.statContent}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{contentCount}</p>
          </div>
        </div>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.submissionsHeading}</h3>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.emptySubmissions}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <TypeBadge type={s.submissionType} />
                  <StatusBadge status={s.status} />
                  <span className="truncate text-xs text-muted-foreground">
                    {s.submittedAt ? formatDateTime(s.submittedAt) : ''}
                  </span>
                </div>
                <Link
                  href={localePath(locale, `/admin/moderation/${s.id}`)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t.viewSubmission} →
                </Link>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.contentHeading}</h3>
        {content.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.emptyContent}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {content.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <TypeBadge type={c.type} />
                  <StatusBadge status={c.status} />
                  <span className="truncate text-sm font-medium">{c.title}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.publishedAt ? formatDateTime(c.publishedAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section aria-label={t.dangerHeading} className="rounded-lg border border-destructive/40 bg-card p-5">
        <h2 className="text-sm font-semibold text-destructive">{t.dangerHeading}</h2>
        <div className="mt-3">
          <DangerZone user={user} copy={t} common={dict.admin.common} />
        </div>
      </section>
    </div>
  )
}

import { notFound } from 'next/navigation'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import { getApprovalForResource, getCredentialById } from '@/lib/admin/queries'
import { CREDENTIAL_CATEGORIES, SECRET_MASK } from '@/lib/security/credential-manager'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { CredentialDetail } from './credential-detail'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.secrets.title }
}

/**
 * Credential detail (plan Phase 2.2, spec §13–§16). The server renders the
 * metadata, the lifecycle history and the rotation-cycle facts; the client
 * console owns the mutations. Nothing on this page can read the stored value —
 * `getCredentialById` never selects `secret_encrypted` (spec §13/§16).
 */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await getRequestLocale()
  const { user, roles, adminRoles } = await requireCapability('secrets.read_metadata', '/admin/secrets')
  const dict = getDictionary(locale)
  const t = dict.admin.secrets

  const { id } = await params
  const credential = await getCredentialById(id)
  if (!credential) notFound()

  // The caller's own live revocation request (§44) — other admins' requests for
  // this credential live in the approvals queue, so this is never a second one.
  const approval = await getApprovalForResource('secret.revoke', 'api_credential', id, user.id)
  const caps = effectiveCapabilities(roles, adminRoles)

  const meta: { label: string; value: string }[] = [
    { label: t.addedByLabel, value: credential.createdByName ?? '—' },
    { label: t.colCreated, value: formatDateTime(credential.createdAt, locale) },
    { label: t.updatedAtLabel, value: formatRelative(credential.updatedAt, locale) },
    { label: t.lastUsedLabel, value: credential.lastUsedAt ? formatRelative(credential.lastUsedAt, locale) : t.never },
    { label: t.colExpires, value: credential.expiresAt ? formatDateTime(credential.expiresAt, locale) : t.noExpiry },
    {
      label: t.colRotation,
      value: credential.rotationPolicy.intervalDays
        ? `${credential.rotationPolicy.intervalDays}d`
        : t.noSchedule,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={credential.name}
        description={`${credential.provider}${credential.category ? ` · ${t.categories[credential.category]}` : ''}`}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/secrets') },
          { label: credential.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {t.colVersion} {credential.version}
            </span>
            <StatusBadge status={credential.effectiveStatus} label={t.status[credential.effectiveStatus]} />
          </div>
        }
      />

      <dl className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        {meta.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="truncate text-sm font-medium" title={item.value}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <CredentialDetail
        credential={{
          id: credential.id,
          name: credential.name,
          provider: credential.provider,
          category: credential.category,
          status: credential.status,
          version: credential.version,
          createdAt: credential.createdAt,
          updatedAt: credential.updatedAt,
          expiresAt: credential.expiresAt,
          notes: credential.notes,
          rotationPolicy: credential.rotationPolicy,
        }}
        rotation={credential.rotation}
        approval={approval}
        caps={{
          manage: caps.has('secrets.manage'),
          rotate: caps.has('secrets.rotate'),
          revoke: caps.has('secrets.revoke'),
        }}
        mask={SECRET_MASK}
        categories={CREDENTIAL_CATEGORIES}
        copy={t}
        common={dict.admin.common}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.historyHeading}</h2>
        {credential.events.length === 0 ? (
          <EmptyState message={t.noHistory} className="p-4" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {[...credential.events].reverse().map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-xs font-medium">
                  {t.events[event.action as keyof typeof t.events] ?? event.action}
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.actorName ?? '—'} · {formatRelative(event.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { loadThemeRecord, loadThemeVersions } from '@/lib/branding'
import { getActiveStates, getApprovalForResource, getThemeAssets } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { ThemeEditor } from '@/components/admin/theme-editor'
import { ThemePublishPanel } from '@/components/admin/theme-publish-panel'
import { ThemeVersionHistory, type ThemeVersionView } from '@/components/admin/theme-version-history'
import { formatDateTime, formatRelative } from '@/lib/admin/format'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.branding.title }
}

/**
 * Theme detail (plan Phase 3.2/3.3, spec §9/§10/§46). The server owns every
 * read: the tokens, the immutable version history and the caller's own pending
 * publication request. The editor beside the preview is the only place a draft
 * changes, and publication stays a §44 two-person operation in the panel above.
 */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await getRequestLocale()
  const { user } = await requireCapability('branding.publish', '/admin/branding')
  const dict = getDictionary(locale)
  const t = dict.admin.branding

  const { id } = await params
  const theme = await loadThemeRecord(id)
  if (!theme) notFound()

  const [versions, assets, activeStates, approval] = await Promise.all([
    loadThemeVersions(id),
    getThemeAssets(id),
    getActiveStates(),
    getApprovalForResource('branding.publish', 'brand_theme', id, user.id),
  ])

  const versionViews: ThemeVersionView[] = versions.map((row) => ({
    id: row.id,
    version: row.version,
    changeSummary: row.changeSummary,
    creatorName: row.creatorName,
    createdAt: row.createdAt,
  }))
  const stateOptions = activeStates.map((state) => ({ id: state.id, name: state.name }))

  const meta: { label: string; value: string }[] = [
    { label: t.colAuthor, value: theme.creatorName ?? '—' },
    { label: t.colUpdated, value: formatRelative(theme.updatedAt ?? theme.createdAt, locale) },
    {
      label: t.status.approved,
      value: theme.approvedAt ? formatDateTime(theme.approvedAt, locale) : '—',
    },
    { label: t.colUsage, value: String(assets.length) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={theme.name}
        description={t.editorHint}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/branding') },
          { label: theme.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
              v{theme.version}
            </span>
            {theme.isActive && (
              <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">
                {t.live}
              </span>
            )}
            <StatusBadge status={theme.status} label={t.status[theme.status]} />
          </div>
        }
      />

      <dl className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        {meta.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="truncate text-sm font-medium" title={item.value}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <ThemePublishPanel
        themeId={theme.id}
        status={theme.status}
        isActive={theme.isActive}
        version={theme.version}
        initialApproval={approval}
        copy={t}
        common={dict.admin.common}
      />

      <ThemeEditor
        themeId={theme.id}
        theme={theme.tokens}
        status={theme.status}
        isActive={theme.isActive}
        states={stateOptions}
        copy={t}
      />

      <ThemeVersionHistory
        themeId={theme.id}
        versions={versionViews}
        currentVersion={theme.version}
        copy={t}
        common={dict.admin.common}
      />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t.assetsTitle}</h2>
          <Link
            href={localePath(locale, '/admin/branding/assets')}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t.assetLibrary}
          </Link>
        </div>
        {assets.length === 0 ? (
          <EmptyState message={t.usedByNone} className="p-4" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {assets.map((asset) => (
              <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-xs font-medium">{asset.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{asset.meta}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TypeBadge type={asset.type} label={t.assetTypes[asset.type]} />
                  <span className="font-mono text-xs text-muted-foreground">v{asset.version}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

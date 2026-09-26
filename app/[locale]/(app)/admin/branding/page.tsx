import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { loadThemeList, type ThemeRecord, type ThemeStatus } from '@/lib/branding'
import { getThemeUsageCounts } from '@/lib/admin/queries/themes'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { StatusBadge } from '@/components/admin/status-badge'
import { fillCopy, formatRelative } from '@/lib/admin/format'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.branding.title }
}

const STATUSES: ThemeStatus[] = ['draft', 'review', 'approved', 'published', 'archived']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('branding.publish', '/admin/branding')
  const dict = getDictionary(locale)
  const t = dict.admin.branding

  const params = await searchParams
  const status = (STATUSES as string[]).includes(params.status ?? '') ? (params.status as ThemeStatus) : undefined

  const [themes, usage] = await Promise.all([loadThemeList(), getThemeUsageCounts()])
  const rows = status ? themes.filter((theme) => theme.status === status) : themes

  const detailHref = (id: string) => localePath(locale, `/admin/branding/${id}`)

  const usageLabel = (theme: ThemeRecord) => {
    const counts = usage[theme.id]
    if (!counts) return t.usageNone
    const parts: string[] = []
    if (counts.assets > 0) parts.push(fillCopy(t.usageAssets, { count: counts.assets }))
    if (counts.states > 0) parts.push(fillCopy(t.usageStates, { count: counts.states }))
    return parts.length > 0 ? parts.join(' · ') : t.usageNone
  }

  const columns: Column<ThemeRecord>[] = [
    {
      key: 'name',
      header: t.colName,
      render: (theme) => (
        <div className="min-w-[180px]">
          <Link href={detailHref(theme.id)} className="text-sm font-medium hover:underline">
            {theme.name}
          </Link>
          {theme.isActive && (
            <span className="ml-2 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium uppercase text-emerald-800">
              {t.live}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'version',
      header: t.colVersion,
      render: (theme) => <span className="font-mono text-xs">v{theme.version}</span>,
      className: 'whitespace-nowrap',
    },
    {
      key: 'status',
      header: t.colStatus,
      render: (theme) => <StatusBadge status={theme.status} label={t.status[theme.status]} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'usage',
      header: t.colUsage,
      render: (theme) => <span className="text-xs text-muted-foreground">{usageLabel(theme)}</span>,
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'author',
      header: t.colAuthor,
      render: (theme) => <span className="text-xs">{theme.creatorName ?? '—'}</span>,
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
    },
    {
      key: 'updated',
      header: t.colUpdated,
      render: (theme) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatRelative(theme.updatedAt ?? theme.createdAt, locale)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (theme) => (
        <Link href={detailHref(theme.id)} className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
          {dict.admin.common.viewDetails}
        </Link>
      ),
      className: 'text-right whitespace-nowrap',
    },
  ]

  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'
  const btnCls = 'rounded-md border border-border px-2.5 py-1.5 text-xs font-medium'

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={localePath(locale, '/admin/branding/colors')}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t.brandColorsNav}
            </Link>
            <Link href={localePath(locale, '/admin/branding/assets')} className={btnCls}>
              {t.assetLibrary}
            </Link>
            <Link
              href={localePath(locale, '/admin/branding/new')}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t.newTheme}
            </Link>
          </div>
        }
      />

      <form method="GET" className="flex flex-wrap items-center gap-1.5">
        <select name="status" defaultValue={params.status ?? ''} aria-label={t.colStatus} className={selectCls}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t.status[value]}
            </option>
          ))}
        </select>
        <button type="submit" className={btnCls}>
          {t.filter}
        </button>
      </form>

      <DataTable
        rows={rows}
        rowKey={(theme) => theme.id}
        columns={columns}
        emptyState={<EmptyState message={themes.length === 0 ? t.empty : t.emptyFiltered} />}
      />
    </div>
  )
}

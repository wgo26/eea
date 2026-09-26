import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getMediaAssets, type MediaAssetRow } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { DataTable, type Column } from '@/components/admin/data-table'
import { FilterPills, SearchBar, ActiveFilters } from '@/components/admin/filter-pills'
import { EmptyState } from '@/components/admin/empty-state'
import { Pager } from '@/components/admin/pager'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { formatBytes, formatDate } from '@/lib/admin/format'
import { MediaArchiveActions, MediaRightsCell } from './media-actions'

/**
 * Media archive (spec §6, plan Phase 5.3).
 *
 * The spec §17 `media_admin` role means "Photo archive and media rights", and
 * `media.manage` already gated seven server actions in
 * lib/admin/actions/media.ts — but no nav entry and no screen asked for that
 * capability, so the role could not reach the work and those actions were
 * unreachable from the UI. This is that screen: the archive with its rights and
 * consent metadata, plus the reversible archive/restore those actions perform.
 *
 * Deliberately NOT the storage screen (`/admin/storage-backup`, chief-only).
 * That answers "are the bytes backed up and verified"; this answers "what is
 * this asset, who owns it, may we publish it". Same table, two jobs — which is
 * why the destructive delete lives there and not here.
 */

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.mediaArchive.title }
}

const PAGE_SIZE = 24
const KINDS = ['image', 'video', 'audio', 'document'] as const
const TABS = ['active', 'archived'] as const

type SearchParams = {
  page?: string
  kind?: string
  q?: string
  tab?: string
  rights?: string
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCapability('media.manage', '/admin/media')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.mediaArchive
  const tc = dict.admin.common

  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const kind = (KINDS as readonly string[]).includes(params.kind ?? '') ? params.kind : undefined
  const tab = (TABS as readonly string[]).includes(params.tab ?? '')
    ? (params.tab as (typeof TABS)[number])
    : 'active'
  const search = params.q?.trim() || undefined
  const rights = params.rights === 'unset' || params.rights === 'confirmed' ? params.rights : undefined

  const { rows, total } = await getMediaAssets({
    page,
    limit: PAGE_SIZE,
    kind,
    search,
    archived: tab === 'archived' ? 'only' : 'exclude',
  })

  // The rights facet narrows the returned page, not the query: `rights_status`
  // is unindexed and this filters convenience over at most PAGE_SIZE rows.
  const visible = rights
    ? rows.filter((row) => (rights === 'unset' ? !row.rightsStatus : row.rightsStatus === 'confirmed'))
    : rows

  const base = localePath(locale, '/admin/media')
  const hrefFor = (extra: Partial<Record<keyof SearchParams, string | undefined>>) => {
    const merged = { kind, q: search, tab, rights, page: undefined as string | undefined, ...extra }
    const sp = new URLSearchParams()
    if (merged.kind) sp.set('kind', merged.kind)
    if (merged.q) sp.set('q', merged.q)
    if (merged.rights) sp.set('rights', merged.rights)
    if (merged.tab && merged.tab !== 'active') sp.set('tab', merged.tab)
    if (merged.page && merged.page !== '1') sp.set('page', merged.page)
    const qs = sp.toString()
    return qs ? `${base}?${qs}` : base
  }

  const missingRights = rows.filter((row) => !row.rightsStatus).length
  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'

  const columns: Column<MediaAssetRow>[] = [
    {
      key: 'asset',
      header: t.colAsset,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {row.publicUrl ? (
            <img
              src={row.publicUrl}
              alt={row.altText ?? row.caption ?? ''}
              loading="lazy"
              className="h-10 w-14 shrink-0 rounded border border-border bg-muted object-cover"
            />
          ) : (
            <span className="inline-flex h-10 w-14 shrink-0 items-center justify-center rounded border border-border bg-muted text-xs text-muted-foreground">
              {t.noPreview}
            </span>
          )}
          <span className="min-w-0">
            <span className="block max-w-64 truncate text-sm font-medium">
              {row.caption ?? row.altText ?? t.untitled}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.kind} · {row.mimeType ?? '—'}
              {row.sizeBytes != null ? ` · ${formatBytes(row.sizeBytes)}` : ''}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'credit',
      header: t.colCredit,
      render: (row) => (
        <span className="block max-w-40 truncate text-xs text-muted-foreground">
          {row.credit ?? row.creator ?? '—'}
        </span>
      ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
    },
    { key: 'rights', header: t.colRights, render: (row) => <MediaRightsCell row={row} copy={t} /> },
    {
      key: 'captured',
      header: t.colCaptured,
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(row.capturedAt ?? row.createdAt, locale)}
        </span>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    {
      key: 'actions',
      header: '',
      stickyRight: true,
      render: (row) => <MediaArchiveActions row={row} copy={t} />,
      className: 'text-right',
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: dict.admin.sidebar.groups.catalogue },
          { label: t.title },
        ]}
      />

      <StatGrid>
        <StatCard label={t.statTotal} value={total} />
        <StatCard
          label={t.statMissingRights}
          value={missingRights}
          hint={missingRights > 0 ? t.missingRightsHint : t.allCleared}
        />
        <StatCard
          label={tab === 'archived' ? t.statArchivedShowing : t.statArchivedHidden}
          value={tab === 'archived' ? total : '—'}
          hint={t.archivedHint}
        />
      </StatGrid>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          pills={TABS.map((key) => ({
            key,
            label: key === 'archived' ? t.tabArchived : t.tabActive,
            href: hrefFor({ tab: key === 'active' ? undefined : key, page: undefined }),
          }))}
          active={tab}
        />
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={t.searchPlaceholder}
          action={hrefFor({ q: undefined, page: undefined })}
          className="w-full sm:w-64"
        />
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-1.5">
        {search && <input type="hidden" name="q" value={search} />}
        {tab === 'archived' && <input type="hidden" name="tab" value="archived" />}
        <select name="kind" defaultValue={kind ?? ''} aria-label={t.filterKind} className={selectCls}>
          <option value="">{t.filterKindAll}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select name="rights" defaultValue={rights ?? ''} aria-label={t.filterRights} className={selectCls}>
          <option value="">{t.filterRightsAll}</option>
          <option value="unset">{t.filterRightsUnset}</option>
          <option value="confirmed">{t.filterRightsConfirmed}</option>
        </select>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
          {t.filter}
        </button>
      </form>

      <ActiveFilters
        chips={[
          ...(kind
            ? [{ key: 'kind', label: `${t.filterKind}: ${kind}`, removeHref: hrefFor({ kind: undefined }) }]
            : []),
          ...(search
            ? [{ key: 'q', label: `${tc.search}: ${search}`, removeHref: hrefFor({ q: undefined }) }]
            : []),
          ...(rights
            ? [
                {
                  key: 'rights',
                  label: `${t.filterRights}: ${
                    rights === 'unset' ? t.filterRightsUnset : t.filterRightsConfirmed
                  }`,
                  removeHref: hrefFor({ rights: undefined }),
                },
              ]
            : []),
        ]}
        clearAllHref={base}
        labels={tc}
      />

      {visible.length === 0 ? (
        <EmptyState
          message={search || kind || rights ? tc.emptyFiltered : t.empty}
          secondaryAction={
            search || kind || rights ? (
              <a href={base} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                {tc.clearFilters}
              </a>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable rows={visible} rowKey={(row) => row.id} columns={columns} />
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            hrefFor={(p) => hrefFor({ page: String(p) })}
            copy={tc}
          />
        </>
      )}
    </div>
  )
}


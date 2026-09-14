import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { localePath } from '@/lib/i18n/urls'
import { getStorageStats, getMediaAssets } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { formatBytes, formatPercent } from '@/lib/admin/format'
import { BackupActions } from './backup-actions'
import { VerificationActions } from './verification-actions'
import { AssetDeleteButton, AssetVerifyButton } from './asset-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.storage.title }
}

const PAGE_SIZE = 25

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireCapability('manageStorage', '/admin/storage-backup')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.storage

  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const [stats, assets] = await Promise.all([
    getStorageStats(),
    getMediaAssets({ page, limit: PAGE_SIZE }),
  ])

  // Provider keys are internal enums — show human-readable names.
  const providerLabels: Record<string, string> = {
    r2: t.providerR2,
    b2: t.providerB2,
    supabase: t.providerSupabase,
  }
  const pageHref = (p: number) => `${localePath(locale, '/admin/storage-backup')}?page=${p}`

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <VerificationActions copy={t} />
            <BackupActions copy={t} />
          </div>
        }
      />

      <StatGrid>
        <StatCard label={t.totalAssets} value={stats.totalAssets} />
        <StatCard label={t.storageUsed} value={formatBytes(stats.totalBytes)} />
        <StatCard
          label={t.pendingBackup}
          value={stats.pendingBackup}
          hint={stats.pendingBackup > 0 ? t.needsAttention : t.allBackedUp}
        />
        <StatCard label={t.pendingVerification} value={stats.pendingVerification} />
      </StatGrid>

      {/* Operations sit directly under the stats so backup/verify are
          visible without scrolling past the provider/kind breakdowns. */}
      <div className="grid gap-2 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card px-3 py-2.5">
          <h3 className="text-xs font-medium">{t.manualBackup}</h3>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t.manualBackupBody}</p>
        </section>
        <section className="rounded-lg border border-border bg-card px-3 py-2.5">
          <h3 className="text-xs font-medium">{t.verification}</h3>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t.verificationBody}</p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t.byProvider}</h2>
        {stats.byProvider.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
          <div className="space-y-1.5">
            {stats.byProvider.map((p) => (
              <div key={p.provider} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">{providerLabels[p.provider] ?? p.provider}</span>
                  <span className="text-[11px] text-muted-foreground">{t.files.replace('{count}', String(p.count))} · {formatBytes(p.bytes)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: formatPercent(p.bytes, stats.totalBytes) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t.byKind}</h2>
        {stats.byKind.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
        <div className="flex flex-wrap gap-1.5">
          {stats.byKind.map((k) => (
            <div key={k.kind} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-card text-xs">
              <span className="font-medium">{k.kind}</span>
              <span className="text-muted-foreground">{k.count}</span>
            </div>
          ))}
        </div>
        )}
      </section>
      </div>

      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t.assetsHeading}</h2>
        {assets.rows.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
          <>
            <DataTable
              rows={assets.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'file', header: t.colFile, render: (r) => (
                  <div className="flex items-center gap-2 min-w-[180px] max-w-[280px]">
                    {r.kind === 'image' && r.publicUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- arbitrary upload hosts */
                      <img src={r.publicUrl} alt="" className="h-8 w-8 rounded object-cover bg-muted shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{r.storageKey ?? r.id}</div>
                      {r.publicUrl && (
                        <a href={r.publicUrl} target="_blank" rel="noreferrer" className="block text-[11px] text-primary hover:underline truncate">
                          {r.publicUrl}
                        </a>
                      )}
                    </div>
                  </div>
                ) },
                { key: 'provider', header: t.colProvider, render: (r) => <span className="text-xs whitespace-nowrap">{providerLabels[r.provider] ?? r.provider}</span>, headerClassName: 'hidden sm:table-cell', className: 'hidden sm:table-cell whitespace-nowrap' },
                { key: 'kind', header: t.colKind, render: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap">{r.kind}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
                { key: 'size', header: t.colSize, render: (r) => <span className="text-xs whitespace-nowrap">{r.sizeBytes != null ? formatBytes(r.sizeBytes) : '—'}</span>, className: 'whitespace-nowrap' },
                { key: 'backup', header: t.colBackup, render: (r) => (
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${r.backedUpAt ? 'text-emerald-600' : 'text-amber-600'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${r.backedUpAt ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {r.backedUpAt ? t.backedUp : t.notBackedUp}
                  </span>
                ), className: 'whitespace-nowrap' },
                { key: 'verification', header: t.colVerification, render: (r) => (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.backupVerifiedAt ? t.verified : (r.verificationStatus ?? t.unverified)}
                  </span>
                ), headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell whitespace-nowrap' },
                { key: 'actions', header: '', stickyRight: true, render: (r) => (
                  <div className="flex items-center justify-end gap-1 flex-nowrap whitespace-nowrap">
                    <AssetVerifyButton mediaId={r.id} copy={t} />
                    <AssetDeleteButton mediaId={r.id} inUse={r.contentItemId != null} copy={t} />
                  </div>
                ), className: 'text-right' },
              ]}
            />
            <Pager page={page} pageSize={PAGE_SIZE} total={assets.total} hrefFor={pageHref} copy={dict.admin.common} />
          </>
        )}
      </section>
    </div>
  )
}


import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { localePath } from '@/lib/i18n/urls'
import { getStorageStats, getMediaAssets } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { DataTable } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { formatBytes, formatPercent } from '@/lib/admin/format'
import { BackupActions } from './backup-actions'
import { VerificationActions } from './verification-actions'
import { AssetVerifyButton } from './asset-actions'

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
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

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

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.byProvider}</h2>
        {stats.byProvider.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t.empty}
          </div>
        ) : (
          <div className="space-y-2">
            {stats.byProvider.map((p) => (
              <div key={p.provider} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium uppercase">{p.provider}</span>
                  <span className="text-xs text-muted-foreground">{t.files.replace('{count}', String(p.count))} · {formatBytes(p.bytes)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
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
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.byKind}</h2>
        <div className="flex flex-wrap gap-2">
          {stats.byKind.map((k) => (
            <div key={k.kind} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs">
              <span className="font-medium">{k.kind}</span>
              <span className="text-muted-foreground">{k.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.assetsHeading}</h2>
        {assets.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t.empty}
          </div>
        ) : (
          <>
            <DataTable
              rows={assets.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'file', header: t.colFile, render: (r) => (
                  <div className="flex items-center gap-2 min-w-0">
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
                { key: 'provider', header: t.colProvider, render: (r) => <span className="text-xs">{providerLabels[r.provider] ?? r.provider}</span> },
                { key: 'kind', header: t.colKind, render: (r) => <span className="text-xs text-muted-foreground">{r.kind}</span> },
                { key: 'size', header: t.colSize, render: (r) => <span className="text-xs">{r.sizeBytes != null ? formatBytes(r.sizeBytes) : '—'}</span> },
                { key: 'backup', header: t.colBackup, render: (r) => (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.backedUpAt ? 'text-emerald-600' : 'text-amber-600'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${r.backedUpAt ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {r.backedUpAt ? t.backedUp : t.notBackedUp}
                  </span>
                ) },
                { key: 'verification', header: t.colVerification, render: (r) => (
                  <span className="text-xs text-muted-foreground">
                    {r.backupVerifiedAt ? t.verified : (r.verificationStatus ?? t.unverified)}
                  </span>
                ) },
                { key: 'actions', header: '', render: (r) => <AssetVerifyButton mediaId={r.id} copy={t} />, className: 'text-right' },
              ]}
            />
            <Pager page={page} pageSize={PAGE_SIZE} total={assets.total} hrefFor={pageHref} copy={dict.admin.common} />
          </>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{t.manualBackup}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t.manualBackupBody}
            </p>
          </div>
          <BackupActions copy={t} />
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div><h3 className="text-sm font-medium">{t.verification}</h3><p className="text-xs text-muted-foreground mt-1">{t.verificationBody}</p></div>
          <VerificationActions copy={t} />
        </div>
      </section>
    </div>
  )
}


import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { getStorageStats } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { formatBytes, formatPercent } from '@/lib/admin/format'
import { BackupActions } from './backup-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.storage.title }
}

export default async function Page() {
  await requireCapability('manageStorage', '/admin/storage-backup')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.storage

  const stats = await getStorageStats()

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
    </div>
  )
}


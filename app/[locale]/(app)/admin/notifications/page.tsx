import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable } from '@/components/admin/data-table'
import { channelStatus } from '@/lib/notify/channels'
import { getDigestPitchStats, getDigestSubscribers, getOutboxQueue, getOutboxStats } from '@/lib/notify/queries'
import { NotificationQueueActions, SubscriberToggle } from './queue-actions'
import { OutboxTable } from './outbox-table'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.notifications.title }
}

export default async function Page() {
  await requireCapability('manageNotifications', '/admin/notifications')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.notifications

  const [outbox, stats, subscribers, pitchStats, channels] = await Promise.all([
    getOutboxQueue(),
    getOutboxStats(),
    getDigestSubscribers(),
    getDigestPitchStats(),
    Promise.resolve(channelStatus()),
  ])
  const queue = outbox.rows

  const channelRows = [
    { name: t.channelEmail, on: channels.email },
    { name: t.channelWhatsapp, on: channels.whatsapp },
    { name: t.channelWhatsappTemplate, on: channels.whatsappTemplate },
    { name: t.channelWebhook, on: channels.webhook },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <StatGrid>
        <StatCard label={`${t.colStatus}: pending`} value={stats.pending} />
        <StatCard label="sent · 24h" value={stats.sent24h} />
        <StatCard label="failed" value={stats.failed} tone={stats.failed > 0 ? 'red' : 'default'} />
      </StatGrid>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-1 text-sm font-medium">{t.channelsHeading}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{t.channelHints}</p>
        <ul className="space-y-2">
          {channelRows.map((c) => (
            <li key={c.name} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${c.on ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} aria-hidden />
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.on ? t.configured : t.notConfigured}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-medium">{t.testHeading}</h3>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{t.testBody}</p>
                  <NotificationQueueActions copy={t} common={dict.admin.common} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.queueHeading}</h2>
        <p className="mb-2 text-xs text-muted-foreground">{t.manualHint}</p>
        {queue.length === 0 ? (
          <EmptyState message={t.emptyQueue} />
        ) : (
          <OutboxTable rows={queue} copy={t} common={dict.admin.common} locale={locale} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.subscribersHeading}</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          {t.pitchSplit.replace('{standard}', String(pitchStats.standard)).replace('{diaspora}', String(pitchStats.diaspora))}
        </p>
        {subscribers.length === 0 ? (
          <EmptyState message={t.emptySubscribers} />
        ) : (
          <DataTable
            rows={subscribers}
            rowKey={(r) => r.id}
            columns={[
              { key: 'contact', header: t.colContact, render: (r) => <span className="text-xs">{r.whatsapp ?? r.phone ?? r.email ?? '—'}{r.diasporaMode ? <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Diaspora</span> : null}{r.pitchVariant === 'diaspora' ? <span className="ml-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300" title={t.pitchDiaspora}>✨</span> : null}</span> },
              { key: 'locale', header: t.colLocale, render: (r) => <span className="text-xs text-muted-foreground">{r.locale ?? '—'}</span> },
              { key: 'active', header: t.colActive, render: (r) => <SubscriberToggle id={r.id} isActive={r.isActive} />, className: 'text-right' },
            ]}
          />
        )}
      </section>
    </div>
  )
}

import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable } from '@/components/admin/data-table'
import { formatRelative } from '@/lib/admin/format'
import { channelStatus } from '@/lib/notify/channels'
import { getDigestSubscribers, getOutboxQueue, getOutboxStats } from '@/lib/notify/queries'
import { NotificationQueueActions, OutboxRowActions, SubscriberToggle } from './queue-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.notifications.title }
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'sent'
      ? 'bg-emerald-500/15 text-emerald-600'
      : status === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : status === 'skipped'
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-500/15 text-amber-600'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {status}
    </span>
  )
}

export default async function Page() {
  await requireCapability('manageNotifications', '/admin/notifications')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.notifications

  const [queue, stats, subscribers, channels] = await Promise.all([
    getOutboxQueue(),
    getOutboxStats(),
    getDigestSubscribers(),
    Promise.resolve(channelStatus()),
  ])

  const channelRows = [
    { name: t.channelEmail, on: channels.email },
    { name: t.channelWhatsapp, on: channels.whatsapp },
    { name: t.channelWhatsappTemplate, on: channels.whatsappTemplate },
    { name: t.channelWebhook, on: channels.webhook },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.colStatus}: pending</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{stats.pending}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">sent · 24h</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{stats.sent24h}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">failed</p>
          <p className="mt-1 text-2xl font-black tabular-nums">{stats.failed}</p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-1 text-sm font-medium">{t.channelsHeading}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t.channelHints}</p>
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
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{t.testBody}</p>
          <NotificationQueueActions copy={t} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t.queueHeading}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t.manualHint}</p>
        {queue.length === 0 ? (
          <EmptyState message={t.emptyQueue} />
        ) : (
          <DataTable
            rows={queue}
            rowKey={(r) => r.id}
            columns={[
              { key: 'event', header: t.colEvent, render: (r) => <div><div className="font-mono text-xs">{r.event}</div><div className="max-w-64 truncate text-xs text-muted-foreground">{r.title}</div>{r.error ? <div className="max-w-64 truncate text-[11px] text-destructive">{r.error}</div> : null}</div> },
              { key: 'audience', header: t.colAudience, render: (r) => <span className="text-xs">{r.audience === 'staff' ? t.staff : t.user}{r.recipientEmail ? <span className="block max-w-40 truncate text-[11px] text-muted-foreground">{r.recipientEmail}</span> : null}</span> },
              { key: 'status', header: t.colStatus, render: (r) => <StatusPill status={r.status} /> },
              { key: 'channels', header: t.colChannels, render: (r) => <span className="text-xs text-muted-foreground">{r.channels.length > 0 ? r.channels.join(' · ') : '—'}</span> },
              { key: 'when', header: t.colWhen, render: (r) => <span className="text-xs text-muted-foreground">{r.createdAt ? formatRelative(r.createdAt, locale) : '—'}</span> },
              { key: 'actions', header: t.colActions, render: (r) => <OutboxRowActions row={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t.subscribersHeading}</h2>
        {subscribers.length === 0 ? (
          <EmptyState message={t.emptySubscribers} />
        ) : (
          <DataTable
            rows={subscribers}
            rowKey={(r) => r.id}
            columns={[
              { key: 'contact', header: t.colContact, render: (r) => <span className="text-xs">{r.whatsapp ?? r.phone ?? r.email ?? '—'}</span> },
              { key: 'locale', header: t.colLocale, render: (r) => <span className="text-xs text-muted-foreground">{r.locale ?? '—'}</span> },
              { key: 'active', header: t.colActive, render: (r) => <SubscriberToggle id={r.id} isActive={r.isActive} />, className: 'text-right' },
            ]}
          />
        )}
      </section>
    </div>
  )
}

import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getOpenDigestSlots, getContentTemplates } from '@/lib/admin/queries/digest'
import { getDigestSubscribers, getDigestPitchStats } from '@/lib/notify/queries'
import { channelStatus } from '@/lib/notify/channels'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { getDigestArchive } from '@/lib/queries/digest'
import {
  setSlotPinned,
  setSlotRemoved,
  setDigestIntroOverride,
  toggleDigestSubscriber,
  sendTestDigest,
  runOpsDigestNow,
  runWeeklyDigestNow,
  compileTemplateNow,
} from '@/lib/admin/actions/digest'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  return { title: dict.admin.digest?.title ?? 'Digest' }
}

export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/digest')
  const dict = getDictionary(locale)
  const t = dict.admin.digest
  const notify = dict.admin.notifications

  const [slotsResult, subscribers, pitchStats, templates, issues, channels] = await Promise.all([
    getOpenDigestSlots(),
    getDigestSubscribers(100),
    getDigestPitchStats(30),
    getContentTemplates(),
    getDigestArchive(locale, 10, 'all'),
    channelStatus(),
  ])

  const { slots, counts } = slotsResult
  const totalSubscribers = subscribers.length
  const activeSubscribers = subscribers.filter((s) => s.isActive).length
  const whatsappSubscribers = subscribers.filter((s) => s.whatsapp && s.isActive).length
  const emailSubscribers = subscribers.filter((s) => s.email && s.isActive).length

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
      />

      {/* Subscriber stats */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{notify.subscribersHeading}</p>
          <p className="mt-1 text-2xl font-medium">{totalSubscribers}</p>
          <p className="mt-1 text-xs text-muted-foreground">{activeSubscribers} Active</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{notify.channelEmail}</p>
          <p className="mt-1 text-2xl font-medium">{emailSubscribers}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{notify.channelWhatsapp}</p>
          <p className="mt-1 text-2xl font-medium">{whatsappSubscribers}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{notify.pitchSplit
            .replace('{standard}', String(pitchStats.standard))
            .replace('{diaspora}', String(pitchStats.diaspora))}</p>
          <p className="mt-1 text-2xl font-medium">{pitchStats.standard + pitchStats.diaspora}</p>
        </div>
      </section>

      {/* Channel status */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{notify.channelWebhook}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status={channels.email ? 'active' : 'inactive'} label={channels.email ? 'Configured' : 'Not configured'} />
          <StatusBadge status={channels.whatsapp ? 'active' : 'inactive'} label={channels.whatsapp ? 'Configured' : 'Not configured'} />
          <StatusBadge status={channels.whatsappTemplate ? 'active' : 'inactive'} label={channels.whatsappTemplate ? 'Configured' : 'Not configured'} />
          <StatusBadge status={channels.webhook ? 'active' : 'inactive'} label={channels.webhook ? 'Configured' : 'Not configured'} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{notify.channelHints}</p>
      </section>

      {/* Open digest slots (accumulating for tonight) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">{t.openCounts.replace('{en}', String(counts.en)).replace('{fr}', String(counts.fr))}</h2>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </div>
          <div className="flex gap-2">
            <form action={async () => { await runOpsDigestNow() }}>
              <Button type="submit" variant="outline" size="sm">Run daily digest now</Button>
            </form>
            <form action={async () => { await runWeeklyDigestNow() }}>
              <Button type="submit" variant="outline" size="sm">Run weekly digest now</Button>
            </form>
          </div>
        </div>
        {slots.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
          <div className="space-y-2">
            {slots.slice(0, 20).map((slot) => (
              <div key={slot.id} className={`rounded-lg border border-border bg-card p-3 ${slot.removed ? 'opacity-50' : ''}`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={slot.pinned ? 'active' : slot.removed ? 'inactive' : 'active'}
                        label={slot.pinned ? t.pinned : slot.removed ? t.dropped : t.sectionCommunity}
                      />
                      <span className="text-sm font-medium truncate">{slot.title.slice(0, 80)}</span>
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{slot.section}</span>
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{slot.locale}</span>
                      {slot.fromSubmission && <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t.fromSubmission}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {slot.itemType} &middot; {slot.path} &middot; {formatRelative(slot.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!slot.pinned && !slot.removed && (
                      <form action={async () => { await setSlotPinned(slot.id, true) }}>
                        <Button type="submit" variant="outline" size="sm">{t.pin}</Button>
                      </form>
                    )}
                    {!slot.removed && (
                      <form action={async () => { await setSlotRemoved(slot.id, true) }}>
                        <Button type="submit" variant="outline" size="sm">{t.drop}</Button>
                      </form>
                    )}
                    {slot.removed && (
                      <form action={async () => { await setSlotRemoved(slot.id, false) }}>
                        <Button type="submit" variant="outline" size="sm">{t.restore}</Button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {slots.length > 20 && (
              <p className="text-xs text-muted-foreground text-center">
                {`… and ${slots.length - 20} more`}
              </p>
            )}
          </div>
        )}
      </section>

      {/* AI Intro Override */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t.introTitle}</h2>
        <p className="text-xs text-muted-foreground">Preview and override tonight&apos;s AI intro and subject.</p>
        <div className="rounded-lg border border-border bg-card p-4">
          <form action={async (data: FormData) => { await setDigestIntroOverride(data.get('locale') as 'en' | 'fr', data.get('intro') as string, data.get('subject') as string) }}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium">{t.introSubjectLabel}</label>
                <Input name="subject" placeholder="Eagle Eye Africa — daily digest" />
              </div>
              <div>
                <label className="block text-xs font-medium">{t.introTitle}</label>
                <Textarea name="intro" rows={3} placeholder="Your AI-generated intro here…" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline">{t.introRegenerate}</Button>
              <Button type="submit">{t.introCopy}</Button>
            </div>
          </form>
        </div>
      </section>

      {/* Subscriber management */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Subscribers</h2>
        {subscribers.length === 0 ? (
          <EmptyState message="No subscribers yet." />
        ) : (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Contact</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Locale</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Pitch</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Active</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscribers.map((sub) => (
                    <tr key={sub.id}>
                      <td className="py-2 px-3">
                        <div className="flex flex-col gap-1">
                          {sub.email && <span className="truncate">{sub.email}</span>}
                          {sub.whatsapp && <span className="text-muted-foreground">WA: {sub.whatsapp}</span>}
                        </div>
                      </td>
                      <td className="py-2 px-3">{sub.locale ?? '—'}</td>
                      <td className="py-2 px-3">{sub.pitchVariant}</td>
                      <td className="py-2 px-3">
                        <StatusBadge status={sub.isActive ? 'active' : 'inactive'} label={sub.isActive ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="py-2 px-3">
                        <form action={async () => { await toggleDigestSubscriber(sub.id, !sub.isActive) }}>
                          <Button type="submit" variant="ghost" size="sm">
                            {sub.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Test send */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Test send (to your account)</h2>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex gap-2">
             <form action={async (data: FormData) => { await sendTestDigest(data.get('locale') as 'en' | 'fr', 'daily') }}>
               <input type="hidden" name="locale" value={locale} />
               <Button type="submit">Send daily test (EN)</Button>
             </form>
             <form action={async (data: FormData) => { await sendTestDigest(data.get('locale') as 'en' | 'fr', 'daily') }}>
               <input type="hidden" name="locale" value={locale === 'en' ? 'fr' : 'en'} />
               <Button type="submit" variant="outline">Send daily test (FR)</Button>
             </form>
             <form action={async (data: FormData) => { await sendTestDigest(data.get('locale') as 'en' | 'fr', 'weekly') }}>
               <input type="hidden" name="locale" value={locale} />
               <Button type="submit" variant="outline">Send weekly test (EN)</Button>
             </form>
             <form action={async (data: FormData) => { await sendTestDigest(data.get('locale') as 'en' | 'fr', 'weekly') }}>
               <input type="hidden" name="locale" value={locale === 'en' ? 'fr' : 'en'} />
               <Button type="submit" variant="outline">Send weekly test (FR)</Button>
             </form>
          </div>
        </div>
      </section>

      {/* Sent issues archive */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sent issues</h2>
        {issues.length === 0 ? (
          <EmptyState message="No digests sent yet." />
        ) : (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={`${issue.sentOn}-${issue.locale}`} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{issue.subject}</span>
                      <StatusBadge status={issue.cadence === 'daily' ? 'active' : 'inactive'} label={issue.cadence} />
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{issue.locale}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {issue.stories?.length ?? 0} stories &middot; {formatDateTime(issue.sentOn, locale)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recap templates */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Recap templates</h2>
        {templates.length === 0 ? (
          <EmptyState message="No recap templates yet." />
        ) : (
          <ul className="space-y-2">
            {templates.map((tpl) => (
              <li key={tpl.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={tpl.isActive ? 'active' : 'inactive'} label={tpl.isActive ? 'Active' : 'Paused'} />
                      <span className="text-sm font-medium">{locale === 'fr' && tpl.nameFr ? tpl.nameFr : tpl.name}</span>
                      <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{tpl.cadence === 'daily' ? 'Daily' : 'Weekly'}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tpl.section} &middot; Window: {tpl.windowDays} days &middot; {tpl.living ? 'Living' : 'One-shot'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {tpl.draftId && (
                      <a href={localePath(locale, `/admin/content/${tpl.draftId}`)} className="rounded border border-primary bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20">
                        Draft ready
                      </a>
                    )}
                    <form action={async () => { await compileTemplateNow(tpl.id) }}>
                      <Button type="submit" variant="outline" size="sm">Compile now</Button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
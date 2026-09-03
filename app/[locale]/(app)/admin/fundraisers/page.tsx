import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { getFundraisersAdmin } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatRelative, formatPrice } from '@/lib/admin/format'
import { FundraiserCard } from './fundraiser-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.fundraisers.title }
}

/** Public detail href for a story, mirroring lib/queries/home.ts detailHref. */
function storyHref(locale: string, type: string | null, id: string, slug: string | null): string {
  switch (type) {
    case 'photo_story':
      return `/${locale}/photo-stories/${slug ?? id}`
    case 'news':
      return `/${locale}/news/${slug ?? id}`
    case 'culture':
      return `/${locale}/culture/${slug ?? id}`
    default:
      return `/${locale}/news/${slug ?? id}`
  }
}

export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('manageFundraisers', '/admin/fundraisers')
  const dict = getDictionary(locale)
  const t = dict.admin.fundraisers

  const fundraisers = await getFundraisersAdmin()

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      {fundraisers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {fundraisers.map((f) => {
            const percent = f.goalAmount > 0 ? Math.min(100, Math.round((f.raisedAmount / f.goalAmount) * 100)) : 0
            return (
              <div key={f.contentItemId} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={f.closedAt ? 'closed' : 'open'} />
                      {f.storyStatus && <StatusBadge status={f.storyStatus} />}
                    </div>
                    <h3 className="mt-1.5 text-sm font-medium">
                      {f.storyTitle ?? f.slug ?? f.contentItemId}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t.story}:{' '}
                      <Link href={storyHref(locale, f.storyType, f.contentItemId, f.slug)} className="underline hover:text-foreground">
                        {f.slug ?? f.contentItemId}
                      </Link>
                    </p>
                  </div>
                  <FundraiserCard row={f} copy={t} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t.raised}: <span className="text-foreground font-medium">{formatPrice(f.raisedAmount, f.currency)}</span>
                    {' · '}
                    {t.goal}: <span className="text-foreground font-medium">{formatPrice(f.goalAmount, f.currency)}</span>
                  </span>
                  <span className="font-medium">{t.progress.replace('{percent}', String(percent))}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${percent >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t.organizer}: <span className="text-foreground/80">{f.organizerName ?? '—'}</span>
                  </span>
                  {f.deadlineAt ? (
                    <span>
                      {t.deadline}: <span className="text-foreground/80">{formatRelative(f.deadlineAt, locale)}</span>
                    </span>
                  ) : (
                    <span>{t.noDeadline}</span>
                  )}
                  {f.donationUrl && (
                    <a href={f.donationUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                      {t.donationUrl}
                    </a>
                  )}
                </div>
                {f.verificationNotes && (
                  <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    {t.verification}: {f.verificationNotes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

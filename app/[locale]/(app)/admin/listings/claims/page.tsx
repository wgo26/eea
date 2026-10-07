import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireAnyCapability } from '@/lib/auth/guards'
import { getClaimsQueue, getReviewsQueue } from '@/lib/professionals/actions'
import { getPendingIntents } from '@/lib/billing/actions'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { ClaimActions } from './claims-actions'
import { PaymentsTable } from './payments-table'
import { ReviewsTable } from './reviews-table'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.businessClaims.title }
}

const STATUS_KEYS = ['pending', 'approved', 'rejected'] as const

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const locale = await getRequestLocale()
  // Same desks as the parent Listings section — a sub-route may never demand
  // more than its owner admits (nav-integrity SUB_ROUTES rule).
  await requireAnyCapability(['manageContent', 'listings.manage'], '/admin/listings/claims')
  const dict = getDictionary(locale)
  const t = dict.admin.businessClaims

  const params = await searchParams
  const status = (STATUS_KEYS as readonly string[]).includes(params.status ?? '')
    ? (params.status as (typeof STATUS_KEYS)[number])
    : 'pending'

  const claims = await getClaimsQueue(status).catch(() => [])
  const intents = await getPendingIntents().catch(() => [])
  const reviews = await getReviewsQueue('pending').catch(() => [])
  const base = localePath(locale, '/admin/listings/claims')

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Link href={localePath(locale, '/admin/listings')} className="text-xs text-muted-foreground hover:text-foreground">
            ← Buy & Sell
          </Link>
        }
      />
      <nav aria-label={t.title} className="flex flex-wrap gap-1.5">
        {STATUS_KEYS.map((key) => (
          <Link
            key={key}
            href={key === 'pending' ? base : `${base}?status=${key}`}
            aria-current={status === key ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              status === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {key === 'pending' ? t.statusPending : key === 'approved' ? t.statusApproved : t.statusRejected}
          </Link>
        ))}
      </nav>

      <section aria-label={t.paymentsTitle} className="grid gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-muted-foreground">
          {t.paymentsTitle}
        </h2>
        <PaymentsTable intents={intents} copy={t} />
      </section>

      <section aria-label={t.reviewsTitle} className="grid gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-muted-foreground">
          {t.reviewsTitle}
        </h2>
        <ReviewsTable reviews={reviews} copy={t} />
      </section>

      {claims.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">{t.colBusiness}</th>
                <th className="px-3 py-2">{t.colClaimant}</th>
                <th className="px-3 py-2">{t.colContact}</th>
                <th className="px-3 py-2">{t.colSkills}</th>
                <th className="px-3 py-2">{t.colReceived}</th>
                {status === 'pending' ? <th className="px-3 py-2"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <p className="font-semibold">{claim.businessName}</p>
                    {claim.locationName ? <p className="text-xs text-muted-foreground">{claim.locationName}</p> : null}
                    {claim.categoryText ? <p className="text-xs text-muted-foreground">{claim.categoryText}</p> : null}
                    {claim.description ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{claim.description}</p> : null}
                  </td>
                  <td className="px-3 py-2">{claim.claimantName}</td>
                  <td className="px-3 py-2 text-xs">
                    {[claim.contactPhone, claim.contactEmail, claim.whatsapp].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex max-w-48 flex-wrap gap-1">
                      {claim.skills.slice(0, 6).map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {s}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(claim.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')}
                  </td>
                  {status === 'pending' ? (
                    <td className="px-3 py-2">
                      <ClaimActions claim={claim} copy={t} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

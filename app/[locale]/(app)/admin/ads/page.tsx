import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { getAdSlots, getAdvertisers } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { DataTable } from '@/components/admin/data-table'
import { formatDate, formatPrice, formatPercent } from '@/lib/admin/format'
import { AdSlotActions } from './ad-slot-actions'
import type { AdSlotRow } from '@/lib/admin/queries'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.ads.title }
}

export default async function Page() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.ads

  const [slots, advertisers] = await Promise.all([
    getAdSlots(),
    getAdvertisers(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.slotsHeading}</h2>
        {slots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t.emptySlots}
          </div>
        ) : (
          <DataTable
            rows={slots}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: t.colSlot, render: (r) => <div className="text-sm font-medium">{r.name}</div> },
              { key: 'placement', header: t.colPlacement, render: (r) => <span className="text-xs text-muted-foreground">{r.placement}</span> },
              { key: 'dimensions', header: t.colSize, render: (r) => <span className="text-xs font-mono">{r.dimensions}</span> },
              { key: 'pricing', header: t.colBasePrice, render: (r) => <span className="text-xs">{formatPrice(r.basePrice, r.currency)}</span> },
              { key: 'status', header: t.colStatus, render: (r) => (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  {r.isActive ? t.active : t.inactive}
                </span>
              ) },
              { key: 'actions', header: '', render: (r) => <AdSlotActions slot={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.campaignsHeading}</h2>
        {slots.filter((s) => s.activeCampaign).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t.emptyCampaigns}
          </div>
        ) : (
          <DataTable
            rows={slots.filter((s) => s.activeCampaign) as (AdSlotRow & { activeCampaign: NonNullable<AdSlotRow['activeCampaign']> })[]}
            rowKey={(r) => r.activeCampaign.id}
            columns={[
              { key: 'campaign', header: t.colCampaign, render: (r) => (
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.activeCampaign.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.activeCampaign.advertiserName}</div>
                </div>
              ) },
              { key: 'slot', header: t.colSlot, render: (r) => <span className="text-xs">{r.name}</span> },
              { key: 'dates', header: t.colDates, render: (r) => (
                <div className="text-xs text-muted-foreground">
                  <div>{formatDate(r.activeCampaign.startsAt)} → {formatDate(r.activeCampaign.endsAt)}</div>
                </div>
              ) },
              { key: 'pricing', header: t.colPrice, render: (r) => <span className="text-xs">{formatPrice(r.activeCampaign.agreedPrice, r.activeCampaign.currency)}</span> },
              { key: 'performance', header: t.colPerformance, render: (r) => (
                <div className="text-xs">
                  <span>{r.activeCampaign.impressions.toLocaleString()} {t.impressions}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{r.activeCampaign.clicks.toLocaleString()} {t.clicks}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{formatPercent(r.activeCampaign.clicks, r.activeCampaign.impressions)} CTR</span>
                </div>
              ) },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.advertisersHeading}</h2>
        {advertisers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t.emptyAdvertisers}
          </div>
        ) : (
          <DataTable
            rows={advertisers}
            rowKey={(r) => r.id}
            columns={[
              { key: 'company', header: t.colCompany, render: (r) => (
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.companyName}</div>
                  <div className="text-xs text-muted-foreground">{r.contactName}</div>
                </div>
              ) },
              { key: 'contact', header: t.colContact, render: (r) => (
                <div className="text-xs text-muted-foreground">
                  {r.email && <div>{r.email}</div>}
                  {r.phone && <div>{r.phone}</div>}
                </div>
              ) },
              { key: 'campaigns', header: t.colCampaigns, render: (r) => (
                <span className="text-xs">{t.campaignsCount.replace('{active}', String(r.activeCampaigns)).replace('{total}', String(r.totalCampaigns))}</span>
              ) },
            ]}
          />
        )}
      </section>
    </div>
  )
}


import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getAdSlots, getAdvertisers, getPendingAdInquiries, getCampaigns } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { Tabs } from '@/components/admin/tabs'
import { DataTable } from '@/components/admin/data-table'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDate, formatPrice, formatPercent } from '@/lib/admin/format'
import { AdSlotActions } from './ad-slot-actions'
import { AdCreateForms } from './ad-create-forms'
import { InquiryActions } from './inquiry-actions'
import { AdvertiserActions } from './advertiser-actions'
import { CampaignActions } from './campaign-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.ads.title }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCapability('manageAds', '/admin/ads')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.ads

  const [slots, advertisers, inquiries, campaigns] = await Promise.all([
    getAdSlots(),
    getAdvertisers(),
    getPendingAdInquiries(),
    getCampaigns(),
  ])

  const campaignStatusLabels: Record<string, string> = {
    active: t.statusActive,
    paused: t.statusPaused,
    pending: t.statusPending,
    ended: t.statusEnded,
  }

  const tab = (await searchParams).tab === 'inquiries' ? 'inquiries' : 'operations'

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <Tabs
        tabs={[
          { key: 'inquiries', label: t.inquiriesTab, count: inquiries.length },
          { key: 'operations', label: t.operationsTab },
        ]}
        active={tab}
        hrefFor={(key) => `${localePath(locale, '/admin/ads')}?tab=${key}`}
      />

      <AdCreateForms
        copy={t}
        slots={slots}
        advertisers={advertisers.map((a) => ({ id: a.id, companyName: a.companyName }))}
      />

      {tab === 'inquiries' && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{t.inquiriesHeading}</h2>
          {inquiries.length === 0 ? <EmptyState message={t.emptyInquiries} /> : (
            <DataTable rows={inquiries} rowKey={(r) => r.id} columns={[
              { key: 'company', header: t.colCompany, render: (r) => <div><div className="text-sm font-medium">{r.advertiserName ?? r.name}</div><div className="text-xs text-muted-foreground">{r.email} {r.phone}</div></div> },
              { key: 'message', header: t.inquiryMessage, render: (r) => <span className="whitespace-pre-wrap text-xs text-muted-foreground">{r.copyText ?? '—'}</span> },
              { key: 'actions', header: '', render: (r) => <InquiryActions inquiry={r} slots={slots} copy={t} />, className: 'text-right' },
            ]} />
          )}
        </section>
      )}

      {tab !== 'inquiries' && <><section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.slotsHeading}</h2>
        {slots.length === 0 ? (
          <EmptyState message={t.emptySlots} />
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
        {campaigns.length === 0 ? (
          <EmptyState message={t.emptyCampaigns} />
        ) : (
          <DataTable
            rows={campaigns}
            rowKey={(r) => r.id}
            columns={[
              { key: 'campaign', header: t.colCampaign, render: (r) => (
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.advertiserName}</div>
                </div>
              ) },
              { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={campaignStatusLabels[r.status] ?? r.status} /> },
              { key: 'slot', header: t.colSlot, render: (r) => <span className="text-xs">{r.slotName ?? '—'}</span> },
              { key: 'dates', header: t.colDates, render: (r) => (
                <div className="text-xs text-muted-foreground">
                  <div>{formatDate(r.startsAt)} → {formatDate(r.endsAt)}</div>
                </div>
              ) },
              { key: 'pricing', header: t.colPrice, render: (r) => <span className="text-xs">{formatPrice(r.agreedPrice, r.currency)}</span> },
              { key: 'performance', header: t.colPerformance, render: (r) => (
                <div className="text-xs">
                  <span>{r.impressions.toLocaleString()} {t.impressions}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{r.clicks.toLocaleString()} {t.clicks}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{formatPercent(r.clicks, r.impressions)} CTR</span>
                </div>
              ) },
              { key: 'actions', header: '', render: (r) => <CampaignActions campaign={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.advertisersHeading}</h2>
        {advertisers.length === 0 ? (
          <EmptyState message={t.emptyAdvertisers} />
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
              { key: 'actions', header: '', render: (r) => <AdvertiserActions advertiser={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section></>}
    </div>
  )
}


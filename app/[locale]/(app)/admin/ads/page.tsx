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
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <Tabs
        tabs={[
          { key: 'inquiries', label: t.inquiriesTab, count: inquiries.length },
          { key: 'operations', label: t.operationsTab },
        ]}
        active={tab}
        hrefFor={(key) => `${localePath(locale, '/admin/ads')}?tab=${key}`}
      />

      {tab !== 'inquiries' && (
        <AdCreateForms
          copy={t}
          slots={slots}
          advertisers={advertisers.map((a) => ({ id: a.id, companyName: a.companyName }))}
        />
      )}

      {tab === 'inquiries' && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.inquiriesHeading}</h2>
          {inquiries.length === 0 ? <EmptyState message={t.emptyInquiries} /> : (
            <DataTable rows={inquiries} rowKey={(r) => r.id} columns={[
              { key: 'company', header: t.colCompany, render: (r) => <div className="min-w-[160px] max-w-[240px]"><div className="text-sm font-medium truncate">{r.advertiserName ?? r.name}</div><div className="text-xs text-muted-foreground truncate">{r.email} {r.phone}</div></div> },
              { key: 'message', header: t.inquiryMessage, render: (r) => <span className="block min-w-[200px] max-w-[320px] whitespace-pre-wrap break-words text-xs text-muted-foreground line-clamp-3">{r.copyText ?? '—'}</span> },
              { key: 'actions', header: '', stickyRight: true, render: (r) => <InquiryActions inquiry={r} slots={slots} copy={t} />, className: 'text-right' },
            ]} />
          )}
        </section>
      )}

      {tab !== 'inquiries' && <><section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t.slotsHeading}</h2>
        {slots.length === 0 ? (
          <EmptyState message={t.emptySlots} />
        ) : (
          <DataTable
            rows={slots}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: t.colSlot, render: (r) => <div className="text-sm font-medium whitespace-nowrap">{r.name}</div>, className: 'whitespace-nowrap' },
              { key: 'placement', header: t.colPlacement, render: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap">{r.placement}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
              { key: 'dimensions', header: t.colSize, render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.mobileDimensions ? `${r.dimensions} / ${r.mobileDimensions}` : r.dimensions}</span>, className: 'whitespace-nowrap' },
              { key: 'formats', header: t.colFormat, render: (r) => <span className="text-xs text-muted-foreground">{r.allowedFormats.join(' · ')}{r.maxDurationSeconds ? ` · ≤${r.maxDurationSeconds}s` : ''}</span>, headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
              { key: 'pricing', header: t.colBasePrice, render: (r) => <span className="text-xs whitespace-nowrap">{formatPrice(r.basePrice, r.currency)}</span>, className: 'whitespace-nowrap' },
              { key: 'status', header: t.colStatus, render: (r) => (
                <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  {r.isActive ? t.active : t.inactive}
                </span>
              ), className: 'whitespace-nowrap' },
              { key: 'actions', header: '', stickyRight: true, render: (r) => <AdSlotActions slot={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t.campaignsHeading}</h2>
        {campaigns.length === 0 ? (
          <EmptyState message={t.emptyCampaigns} />
        ) : (
          <DataTable
            rows={campaigns}
            rowKey={(r) => r.id}
            columns={[
              { key: 'campaign', header: t.colCampaign, render: (r) => (
                <div className="min-w-[160px] max-w-[220px]">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.advertiserName}</div>
                </div>
              ) },
              { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={campaignStatusLabels[r.status] ?? r.status} />, className: 'whitespace-nowrap' },
              { key: 'format', header: t.colFormat, render: (r) => (
                <div className="text-xs whitespace-nowrap">
                  <span className="font-medium">{r.creativeType}</span>
                  {r.creativeType !== 'sponsored' ? (
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      r.creativeStatus === 'approved' ? 'bg-emerald-500/15 text-emerald-600' : r.creativeStatus === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/15 text-amber-600'
                    }`}>
                      {r.creativeStatus}
                    </span>
                  ) : null}
                </div>
              ), headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell whitespace-nowrap' },
              { key: 'creative', header: t.colCreative, render: (r) => (
                r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" className="h-8 w-14 rounded border border-border object-cover" />
                ) : r.creativeType === 'html' && r.creativeHtml ? (
                  <span className="text-xs text-muted-foreground">HTML</span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )
              ), headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell' },
              { key: 'slot', header: t.colSlot, render: (r) => <span className="text-xs whitespace-nowrap">{r.slotName ?? '—'}</span>, headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell whitespace-nowrap' },
              { key: 'dates', header: t.colDates, render: (r) => (
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  <div>{formatDate(r.startsAt)} → {formatDate(r.endsAt)}</div>
                </div>
              ), headerClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell whitespace-nowrap' },
              { key: 'pricing', header: t.colPrice, render: (r) => <span className="text-xs whitespace-nowrap">{formatPrice(r.agreedPrice, r.currency)}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
              { key: 'performance', header: t.colPerformance, render: (r) => (
                <div className="text-xs whitespace-nowrap">
                  <span>{r.impressions.toLocaleString()} {t.impressions}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{r.clicks.toLocaleString()} {t.clicks}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span>{formatPercent(r.clicks, r.impressions)} CTR</span>
                </div>
              ), headerClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell whitespace-nowrap' },
              { key: 'actions', header: '', stickyRight: true, render: (r) => <CampaignActions campaign={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{t.advertisersHeading}</h2>
        {advertisers.length === 0 ? (
          <EmptyState message={t.emptyAdvertisers} />
        ) : (
          <DataTable
            rows={advertisers}
            rowKey={(r) => r.id}
            columns={[
              { key: 'company', header: t.colCompany, render: (r) => (
                <div className="min-w-[160px] max-w-[220px]">
                  <div className="text-sm font-medium truncate">{r.companyName}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.contactName}</div>
                </div>
              ) },
              { key: 'contact', header: t.colContact, render: (r) => (
                <div className="text-xs text-muted-foreground max-w-[200px]">
                  {r.email && <div className="truncate">{r.email}</div>}
                  {r.phone && <div className="truncate">{r.phone}</div>}
                </div>
              ), headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell' },
              { key: 'campaigns', header: t.colCampaigns, render: (r) => (
                <span className="text-xs whitespace-nowrap">{t.campaignsCount.replace('{active}', String(r.activeCampaigns)).replace('{total}', String(r.totalCampaigns))}</span>
              ), className: 'whitespace-nowrap' },
              { key: 'actions', header: '', stickyRight: true, render: (r) => <AdvertiserActions advertiser={r} copy={t} />, className: 'text-right' },
            ]}
          />
        )}
      </section></>}
    </div>
  )
}


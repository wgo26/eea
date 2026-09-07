import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { localePath } from '@/lib/i18n/urls'
import {
  getPoliciesAdmin,
  getAboutSectionsAdmin,
  getReports,
  getDataRequests,
  getLegalInboxCounts,
} from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { PolicyCreateForm, PolicyVersionCard } from './policy-actions'
import { AboutSectionEditor } from './about-section-forms'
import { InboxLists } from './inbox-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.policies.title }
}

type TabKey = 'pages' | 'about' | 'inbox'

/** Live dictionary defaults shown next to each override field, per section. */
function aboutDefaults(locale: Locale, dict: ReturnType<typeof getDictionary>) {
  const a = dict.about
  return [
    { key: 'hero', label: 'hero', heading: a.heroTitle, body: a.heroBody, cta: null as string | null },
    { key: 'loop', label: 'loop', heading: a.loopTitle, body: a.loopHint, cta: null },
    { key: 'stats', label: 'stats', heading: a.statsTitle, body: a.statsHint, cta: null },
    { key: 'pipeline', label: 'pipeline', heading: a.pipelineTitle, body: a.pipelineHint, cta: null },
    { key: 'values', label: 'values', heading: a.valuesTitle, body: null, cta: null },
    { key: 'charter', label: 'charter', heading: a.charterTitle, body: a.charterHint, cta: null },
    { key: 'closing', label: 'closing', heading: a.closingTitle, body: a.closingBody, cta: a.closingCta },
  ]
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; locale?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('managePolicies', '/admin/policies')
  const dict = getDictionary(locale)
  const t = dict.admin.policies

  const params = await searchParams
  const tab: TabKey = params.tab === 'about' || params.tab === 'inbox' ? params.tab : 'pages'
  const editLocale: Locale = params.locale === 'fr' ? 'fr' : 'en'

  const [policies, sections, takedowns, requests, counts] = await Promise.all([
    getPoliciesAdmin(),
    getAboutSectionsAdmin(),
    getReports({ reportType: 'copyright', limit: 50 }),
    getDataRequests({ limit: 50 }),
    getLegalInboxCounts(),
  ])

  const openInbox = counts.openTakedowns + counts.openDataRequests
  const tabs = [
    { key: 'pages', label: t.tabPages },
    { key: 'about', label: t.tabAbout },
    { key: 'inbox', label: t.tabInbox, count: openInbox },
  ]
  const hrefFor = (key: string) => `${localePath(locale, '/admin/policies')}?tab=${key}`

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <Tabs tabs={tabs} active={tab} hrefFor={hrefFor} />

      {tab === 'pages' ? (
        <div className="space-y-6">
          <PolicyCreateForm copy={t} />

          {policies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            </div>
          ) : (
            <section className="space-y-3">
              <h2 className="text-sm font-medium">{t.historyTitle}</h2>
              {policies.map((policy) => (
                <PolicyVersionCard
                  key={policy.id}
                  policy={policy}
                  copy={t}
                  common={dict.admin.common}
                  locale={locale}
                  viewHref={localePath(locale, `/about/${policy.policyType}`)}
                />
              ))}
            </section>
          )}
        </div>
      ) : null}

      {tab === 'about' ? (
        <AboutSectionEditor
          copy={t}
          sections={aboutDefaults(locale, dict)}
          overrides={sections}
          editLocale={editLocale}
          locale={locale}
          viewHref={localePath(locale, '/about')}
        />
      ) : null}

      {tab === 'inbox' ? (
        <InboxLists copy={t} takedowns={takedowns} requests={requests} locale={locale} />
      ) : null}
    </div>
  )
}

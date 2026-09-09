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
  // Edit-locale dictionary for the About defaults column (site-content
  // already fixed this: UI locale rendered EN text beside FR fields).
  const editDict = getDictionary(editLocale)

  // EN↔FR parity: group current versions by policy type and warn when one
  // locale is current with no current counterpart in the other.
  const currentByType = new Map<string, { en?: string; fr?: string }>()
  for (const p of policies) {
    if (!p.isCurrent) continue
    const entry = currentByType.get(p.policyType) ?? {}
    if (p.locale === 'en') entry.en = p.version
    if (p.locale === 'fr') entry.fr = p.version
    currentByType.set(p.policyType, entry)
  }
  const parityWarnings: string[] = []
  for (const [type, cur] of currentByType) {
    if (cur.en && !cur.fr) parityWarnings.push(t.parityWarningBody.replace('{type}', type).replace('{enVersion}', cur.en))
    if (cur.fr && !cur.en) parityWarnings.push(t.parityWarningBodyFr.replace('{type}', type).replace('{frVersion}', cur.fr))
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <Tabs tabs={tabs} active={tab} hrefFor={hrefFor} />

      {tab === 'pages' ? (
        <div className="space-y-6">
          <PolicyCreateForm copy={t} />

          {parityWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40" role="alert">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{t.parityWarningTitle}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-200">
                {parityWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

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
                  viewHref={localePath(policy.locale === 'fr' ? 'fr' : 'en', `/about/${policy.policyType}`)}
                />
              ))}
            </section>
          )}
        </div>
      ) : null}

      {tab === 'about' ? (
        <AboutSectionEditor
          copy={t}
          sections={aboutDefaults(editLocale, editDict)}
          overrides={sections}
          editLocale={editLocale}
          locale={locale}
          viewHref={localePath(editLocale, '/about')}
        />
      ) : null}

      {tab === 'inbox' ? (
        <InboxLists copy={t} common={dict.admin.common} takedowns={takedowns} requests={requests} locale={locale} />
      ) : null}
    </div>
  )
}

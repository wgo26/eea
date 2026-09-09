import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import {
  getAdvertiseSectionsAdmin,
  getSiteSettingsAdmin,
} from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { AdvertiseSectionEditor, SiteBrandingForm, SiteLinksForm } from './site-content-forms'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.siteContent.title }
}

/** Live dictionary defaults shown next to each override field, per section. */
function advertiseDefaults(dict: ReturnType<typeof getDictionary>) {
  const a = dict.advertise
  return [
    { key: 'title', label: 'title', heading: a.title as string | null, body: null as string | null },
    { key: 'tagline', label: 'tagline', heading: a.tagline as string | null, body: null },
    { key: 'intro', label: 'intro', heading: null, body: a.intro as string | null },
    { key: 'placements', label: 'placements', heading: a.placementsTitle as string | null, body: a.placementsBody as string | null },
    { key: 'audience', label: 'audience', heading: a.audienceTitle as string | null, body: a.audienceBody as string | null },
    { key: 'pricing', label: 'pricing', heading: a.pricingTitle as string | null, body: a.pricingBody as string | null },
  ]
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('manageSiteContent', '/admin/site-content')
  const dict = getDictionary(locale)
  const t = dict.admin.siteContent

  const params = await searchParams
  const editLocale: Locale = params.locale === 'fr' ? 'fr' : 'en'
  // Defaults must come from the EDIT locale's dictionary — using the UI
  // locale here rendered English built-in text beside French fields.
  const editDict = getDictionary(editLocale)

  const [sections, settings] = await Promise.all([
    getAdvertiseSectionsAdmin(),
    getSiteSettingsAdmin(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t.brandingTitle}</h2>
        <SiteBrandingForm
          copy={t}
          settings={{
            site_logo_url: settings.site_logo_url,
            site_name: settings.site_name,
            site_tagline: settings.site_tagline,
            site_name_fr: settings.site_name_fr,
            site_tagline_fr: settings.site_tagline_fr,
          }}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t.advertiseTitle}</h2>
        <AdvertiseSectionEditor
          copy={t}
          sections={advertiseDefaults(editDict)}
          overrides={sections}
          editLocale={editLocale}
          locale={locale}
          viewHref={localePath(locale, '/advertise')}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t.footerTitle}</h2>
        <SiteLinksForm copy={t} settings={settings} />
      </section>
    </div>
  )
}

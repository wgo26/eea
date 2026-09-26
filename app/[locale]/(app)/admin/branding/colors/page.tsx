import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { loadDocumentTheme } from '@/lib/branding/document'
import { PageHeader } from '@/components/admin/page-header'
import { BrandColorsForm } from '@/components/admin/brand-colors-form'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.branding.brandColorsTitle }
}

/**
 * The simple brand-colour editor (gap 3) for non-designer administrators: three
 * swatches instead of the full token editor at /admin/branding/[id].
 *
 * The base is whatever the site renders RIGHT NOW (`loadDocumentTheme()`), so an
 * admin who only wants to shift the brand colours starts from the live palette
 * rather than from a blank baseline that would silently reset a designer's work.
 * Submitting still creates a DRAFT that copies those tokens forward — the live
 * theme is never edited in place, and publication stays a two-person operation
 * (spec §44).
 *
 * Route shape: `colors` is a static segment and therefore wins over the sibling
 * `[id]` dynamic route, so this page is never captured by the theme detail view;
 * theme ids are UUIDs, so no real id can collide with it.
 */
export default async function Page() {
  const locale = await getRequestLocale()
  // Same capability as the full editor: this is a branding mutation surface,
  // just a narrower one.
  await requireCapability('branding.publish', '/admin/branding')
  const dict = getDictionary(locale)
  const t = dict.admin.branding
  const { theme, themeName, isBaseline } = await loadDocumentTheme()

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.brandColorsTitle}
        description={isBaseline ? t.brandColorsBaseline : `${t.brandColorsWhatIsLive}: ${themeName}`}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/branding') },
          { label: t.brandColorsTitle },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={localePath(locale, '/admin/branding')}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium"
            >
              {t.title}
            </Link>
          </div>
        }
      />
      <BrandColorsForm base={theme} copy={t} />
    </div>
  )
}
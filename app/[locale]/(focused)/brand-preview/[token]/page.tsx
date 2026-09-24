import { notFound } from 'next/navigation'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { loadThemeByPreviewToken } from '@/lib/branding'
import { ThemePreview } from '@/components/admin/theme-preview'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.branding.previewHeading }
}

/**
 * Spec §10/§46 safe preview, shared. The token in the path *is* the
 * authorization, so this route deliberately has no capability guard — an
 * administrator hands it to a designer who has no admin account. It renders the
 * theme's tokens and nothing else: no admin chrome, no navigation into the
 * console, no draft metadata. The (focused) group already sets `noindex`, and
 * the route is revocable by rotating the token on the theme.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; token: string }>
}) {
  const locale = await getRequestLocale()
  const { token } = await params

  const theme = await loadThemeByPreviewToken(token)
  if (!theme) notFound()

  const dict = getDictionary(locale)
  const t = dict.admin.branding

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 py-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">{theme.name}</h1>
        <p className="text-xs text-muted-foreground">{t.previewHint}</p>
      </header>

      <ThemePreview theme={theme.tokens} copy={t} states={[]} bare />
    </div>
  )
}

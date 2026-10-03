import type { Metadata } from 'next'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { buildAlternates, localePath } from '@/lib/i18n/urls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  return { title: dict.home.digestCtaTitle, alternates: buildAlternates(locale, '/digest') }
}

function Honeypot() {
  return (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  )
}

function Turnstile() {
  return (
    <input
      type="hidden"
      name="cf-turnstile-response"
      value=""
    />
  )
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ unsubscribe?: string; unsubscribed?: string; success?: string; error?: string }>
}) {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.digest
  const params = await searchParams

  const showUnsubscribe = params.unsubscribe === 'true' || params.unsubscribe?.length
  const unsubscribeEmail = params.unsubscribe?.length ? params.unsubscribe : ''
  const success = params.success === 'true'
  const error = params.error

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-12 px-4">
      <header className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{dict.home.digestCtaTitle}</h1>
        <p className="text-muted-foreground text-lg">{dict.home.digestCtaBody}</p>
      </header>

      {showUnsubscribe ? (
        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold">{t.unsubscribeTitle}</h2>
          <p className="text-muted-foreground">{t.unsubscribeBody}</p>
          <form action={localePath(locale, '/digest?unsubscribe=true')} method="POST" className="space-y-4">
            <Honeypot />
            <Turnstile />
            <input type="hidden" name="locale" value={locale} />
            <div className="space-y-2">
              <Label htmlFor="unsub-email" className="text-sm font-medium">
                {t.unsubscribeBody}
              </Label>
              <Input
                id="unsub-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                defaultValue={unsubscribeEmail}
                required
                disabled={!!unsubscribeEmail}
              />
            </div>
            <Button type="submit" className="w-full">
              {t.unsubscribeSubmit}
            </Button>
          </form>
          {params.unsubscribed === 'true' && (
            <p className="text-emerald-600 dark:text-emerald-400">{t.unsubscribed}</p>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-6 space-y-4">
          <form action={localePath(locale, '/digest')} method="POST" className="space-y-4">
            <Honeypot />
            <Turnstile />
            <input type="hidden" name="locale" value={locale} />

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {t.email}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required={false}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp" className="text-sm font-medium">
                {t.whatsapp}
              </Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                placeholder="+237 6 XX XX XX XX"
                required={false}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="diaspora_mode"
                name="diaspora_mode"
                value="on"
              />
              <Label htmlFor="diaspora_mode" className="text-sm">
                {t.diasporaMode}
              </Label>
            </div>

            <input type="hidden" name="pitch_variant" value="standard" />

            <p className="text-xs text-muted-foreground">
              {t.privacyNote}
            </p>

            <Button type="submit" className="w-full" size="lg">
              {t.submit}
            </Button>
          </form>

          {success && (
            <p className="text-emerald-600 dark:text-emerald-400 text-center">
              {t.successBody}
            </p>
          )}

          {error && (
            <p className="text-destructive text-center text-sm">
              {error === 'rate_limited' ? t.errorRateLimited : error === 'captcha' ? t.errorCaptcha : t.errorGeneric}
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">
            <a href={localePath(locale, "/digest?unsubscribe=true")} className="underline hover:text-foreground">
              {t.unsubscribeSubmit}
            </a>
          </p>
        </section>
      )}

      <footer className="text-center text-xs text-muted-foreground">
        <p>{dict.digest.viewArchive}</p>
      </footer>
    </div>
  )
}
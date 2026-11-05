import type { Metadata } from 'next'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { buildAlternates, localePath } from '@/lib/i18n/urls'
import { getPromotedPitch } from '@/lib/automation/flags'
import { ShareButtons } from '@/components/share-buttons'
import { DigestForm } from '@/components/digest/digest-form'
import { SITE } from '@/lib/constants'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  return { title: dict.home.digestCtaTitle, alternates: buildAlternates(locale, '/digest') }
}

/**
 * Daily-digest opt-in and opt-out.
 *
 * The forms are the shared `DigestForm` client component driving the
 * `subscribeDigest` / `unsubscribeDigest` Server Actions, so submission works
 * with and without JS (Next falls back to a plain POST of the action's own
 * endpoint). The previous inline `method="POST"` forms targeted this page's
 * own path, where no POST handler exists — they could never complete, and the
 * duplicate markup had already drifted from the component.
 *
 * Phase 1: locale comes from the request (the page is dynamic anyway — the
 * share URL and the unsubscribe flow are locale-prefixed).
 */
export default async function Page() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.digest
  // E2 — the nightly sweep promotes a winning pitch variant; while it is null
  // `DigestForm` keeps the client-side 50/50 split running.
  const promotedPitch = await getPromotedPitch()

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-12 px-4">
      <header className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{dict.home.digestCtaTitle}</h1>
        <p className="text-muted-foreground text-lg">{dict.home.digestCtaBody}</p>
      </header>

      {/* P3 growth: WhatsApp-forward beats a new digest product with no users.
          Readers share the signup (or any issue) straight into their groups —
          no digest_personalization tables, just the OS share sheet + wa.me. */}
      <div className="flex justify-center">
        <ShareButtons
          url={`${SITE.url}${localePath(locale, "/digest")}`}
          title={dict.home.digestCtaTitle}
          locale={locale}
          labels={{
            share: dict.common.share,
            whatsapp: dict.common.whatsapp,
            copyLink: dict.common.copyLink,
            copied: dict.common.copied,
          }}
        />
      </div>

      <DigestForm dict={dict} locale={locale} promotedPitch={promotedPitch} />

      <footer className="text-center text-xs text-muted-foreground">
        <a
          href={localePath(locale, '/digest/archive')}
          className="underline hover:text-foreground"
        >
          {t.viewArchive}
        </a>
      </footer>
    </div>
  )
}

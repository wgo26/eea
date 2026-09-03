import { redirect } from 'next/navigation'
import { resolveLocale } from '@/lib/i18n'

/**
 * /{locale}/admin → the staff dashboard in the SAME locale.
 * (P0-3 fixed: this used to hardcode /en, dumping French users into the
 * English admin. Unprefixed /admin never reaches a page — proxy.ts
 * redirects it into the locale first.)
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${resolveLocale(locale)}/admin/dashboard`)
}

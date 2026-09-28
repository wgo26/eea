import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { PublicShell } from '@/components/shells/public-shell'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { loadBrandIdentity } from '@/lib/branding/identity'

// Client-only (no SSR): eligibility reads localStorage + matchMedia, which
// have no server answer — server-rendering it would hydrate a mismatch.
const InstallPrompt = dynamic(
    () => import('@/components/system/install-prompt').then((m) => m.InstallPrompt),
    { ssr: false },
)

/**
 * Public route group — the ONLY place the browsing chrome (header + footer)
 * renders. Shell assignment is a static routing decision, not a runtime
 * header sniff (checklist item 2), so a public page can never leak app
 * chrome and an app page can never leak public chrome.
 *
 * A3: the locale comes from the [locale] segment (params), never from
 * getRequestLocale() — a headers()/cookies() read here would force every
 * public page into per-request rendering and defeat ISR.
 */
export default async function PublicGroupLayout({
    children,
    params,
}: {
    children: ReactNode
    params: Promise<{ locale: string }>
}) {
    const { locale: raw } = await params
    const locale = resolveLocale(raw)
    // Brand-aware install prompt (cached reads only — the segment stays
    // ISR-compatible). Mounted on the public shell only: install prompts on
    // login/admin screens would be noise.
    const [identity] = await Promise.all([loadBrandIdentity()])
    const dict = getDictionary(locale)
    return (
        <>
            <PublicShell locale={locale}>{children}</PublicShell>
            <InstallPrompt siteName={identity.siteName} copy={dict.pwa} />
        </>
    )
}
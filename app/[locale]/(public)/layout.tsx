import type { ReactNode } from 'react'
import { PublicShell } from '@/components/shells/public-shell'
import { InstallPromptHost } from '@/components/system/install-prompt-host'
import { AdRuntimeProvider } from '@/components/ads/ad-runtime-provider'
import { getDictionary, resolveLocale } from '@/lib/i18n'
import { loadBrandIdentity } from '@/lib/branding/identity'
import { getAdNetworkConfig } from '@/lib/queries/ad-networks'

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
    //
    // Ad runtime config is the same shape of read: the DB-backed network config
    // (edited at /admin/ads) is resolved here, cached under the `ads` tag, and
    // handed to the client ad renderer through context — so a tag change never
    // needs a rebuild, and the public tree stays statically renderable.
    const [identity, adConfig] = await Promise.all([loadBrandIdentity(), getAdNetworkConfig()])
    const dict = getDictionary(locale)
    return (
        <>
            <AdRuntimeProvider value={{ config: adConfig, locale }}>
                <PublicShell locale={locale}>{children}</PublicShell>
            </AdRuntimeProvider>
            <InstallPromptHost siteName={identity.siteName} copy={dict.pwa} />
        </>
    )
}
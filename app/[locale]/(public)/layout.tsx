import type { ReactNode } from 'react'
import { PublicShell } from '@/components/shells/public-shell'
import { AnalyticsBeacon } from '@/components/system/analytics-beacon'
import { resolveLocale } from '@/lib/i18n'

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
    return (
        <>
            {/* W13 — aggregate-only page-view beacon (client island, fires
                once per pathname change; no cookie/header reads here so the
                layout stays ISR-safe). */}
            <AnalyticsBeacon locale={locale} />
            <PublicShell locale={locale}>{children}</PublicShell>
        </>
    )
}
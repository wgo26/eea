import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, locales, resolveLocale } from "@/lib/i18n";
import { HtmlLang } from "@/components/html-lang";
import { loadBrandIdentity, siteNameFor } from "@/lib/branding/identity";
import { CookieBanner } from "@/components/system/cookie-banner";
import { BackToTop } from "@/components/system/back-to-top";
import { ServiceWorkerRegister } from "@/components/system/sw-register";

type LocaleLayoutProps = {
    children: ReactNode;
    params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

/**
 * The localized title template comes from the brand identity (gap 4), not a
 * literal: an editor who renames the site in /admin/site-content, or publishes a
 * theme, changes every `%s · <name>` suffix instead of leaving the subtree
 * stamped with a name that only exists in source. French gets `site_name_fr`
 * when set and falls back to the canonical name.
 *
 * Cached-reads-only, so the [locale] segment stays ISR-compatible.
 */
export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const identity = await loadBrandIdentity();
    // No layout-level canonical/hreflang here: canonical must be each page's
    // own localized URL (checklist item 10) — pages set it via
    // buildAlternates(locale, path) in their generateMetadata.
    return {
        title: {
            default: dict.meta.title,
            template: `%s · ${siteNameFor(locale, identity)}`,
        },
        description: dict.meta.description,
    };
}

/**
 * Locale segment guard — every user-facing route lives under /[locale]
 * (checklist item 1). Keeps <html lang> in sync for client-side navigations.
 */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
    const { locale: raw } = await params;
    if (!isLocale(raw)) notFound();
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    return (
        <>
            <HtmlLang locale={raw} />
            <div className="flex-1">{children}</div>
            {/* Localized cookie banner (moved from the static root layout —
                Phase 4.1): every user-facing route lives under [locale]
                (checklist item 1), so coverage is unchanged while the root
                shell stays request-API-free and ISR becomes possible. */}
            <CookieBanner locale={locale} dict={dict} />
            <BackToTop label={dict.common.backToTop} />
            {/* Phase 4 — offline PWA: registers /sw.js on load (production only). */}
            <ServiceWorkerRegister />
        </>
    );
}

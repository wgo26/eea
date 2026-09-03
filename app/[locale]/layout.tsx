import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, locales, resolveLocale } from "@/lib/i18n";
import { HtmlLang } from "@/components/html-lang";

type LocaleLayoutProps = {
    children: ReactNode;
    params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    // No layout-level canonical/hreflang here: canonical must be each page's
    // own localized URL (checklist item 10) — pages set it via
    // buildAlternates(locale, path) in their generateMetadata.
    return {
        title: {
            default: dict.meta.title,
            template: `%s · Eagle Eye Africa`,
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

    return (
        <>
            <HtmlLang locale={raw} />
            <div className="flex-1">{children}</div>
        </>
    );
}

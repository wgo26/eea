"use client";

import Link from "next/link";
import { getChromeStrings } from "@/lib/i18n/chrome";
import { localeHref, useLocaleFromPath } from "@/components/site-header";

/**
 * A3 — static-safe 404 content.
 *
 * `app/[locale]/not-found.tsx` receives no params and must not read request
 * APIs (headers()/cookies() there forced the ENTIRE [locale] subtree into
 * per-request rendering, defeating all ISR). The locale is therefore derived
 * client-side from the URL prefix — the same source the header uses — and
 * strings come from the tiny chrome module, never the full dictionary.
 */
export function NotFoundContent() {
    const locale = useLocaleFromPath();
    const t = getChromeStrings(locale).notFound;

    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
            <p className="text-7xl font-extrabold tracking-tight text-primary/70">404</p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                {t.title}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {t.body}
            </p>
            <Link
                href={localeHref(locale, "/")}
                className="mt-8 inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
                {t.home}
            </Link>
        </div>
    );
}

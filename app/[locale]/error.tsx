"use client";

import { useEffect } from "react";
import Link from "next/link";
import { getDictionary, locales, type Locale } from "@/lib/i18n";

/** Error boundaries receive no params — derive the locale from the URL. */
function localeFromLocation(): Locale {
    if (typeof window === "undefined") return "en";
    const first = window.location.pathname.split("/")[1];
    return (locales as readonly string[]).includes(first) ? (first as Locale) : "en";
}

/**
 * Localized error boundary for every route under /[locale] (P0-8).
 * Client component by definition; the locale is read from the URL prefix.
 */
export default function LocaleError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    const dict = getDictionary(localeFromLocation());
    const locale = localeFromLocation();
    const homeHref = locale === "en" ? "/en" : `/${locale}`;

    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {dict.system.error.title}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {dict.system.error.body}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {dict.system.error.retry}
                </button>
                <Link
                    href={homeHref}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {dict.system.error.home}
                </Link>
            </div>
        </div>
    );
}
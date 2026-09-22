"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { getDictionary, locales, type Locale } from "@/lib/i18n";

/** Error boundaries receive no params — derive the locale from the URL. */
function localeFromLocation(): Locale {
    if (typeof window === "undefined") return "en";
    const first = window.location.pathname.split("/")[1];
    return (locales as readonly string[]).includes(first) ? (first as Locale) : "en";
}

export type RouteErrorVariant = "public" | "admin" | "account";

/**
 * Shared group-level error UI: the same localized title/body/retry copy as
 * the [locale] fallback (dict.system.error), but the recovery link points at
 * the section home — public homepage, admin dashboard, or account dashboard —
 * so one bad component never strands the user with nowhere relevant to go.
 */
export function RouteError({
    error,
    reset,
    variant,
}: {
    error: Error & { digest?: string };
    reset: () => void;
    variant: RouteErrorVariant;
}) {
    useEffect(() => {
        console.error(error);
        Sentry.captureException(error);
    }, [error]);

    const locale = localeFromLocation();
    const dict = getDictionary(locale);
    const home =
        variant === "admin"
            ? { href: `/${locale}/admin/dashboard`, label: dict.admin.sidebar.dashboard }
            : variant === "account"
              ? { href: `/${locale}/account`, label: dict.account.topbar.dashboard }
              : { href: `/${locale}`, label: dict.system.error.home };

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
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
                    href={home.href}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    {home.label}
                </Link>
            </div>
        </div>
    );
}

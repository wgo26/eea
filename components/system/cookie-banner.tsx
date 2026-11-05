"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { readConsent, subscribeConsent, writeConsent, type ConsentValue } from "@/lib/consent";

/**
 * Consent flag as a tiny external store read via `useSyncExternalStore`.
 * The server snapshot reports "answered", so the banner never ships in the
 * SSR HTML; the real value is picked up right after hydration — the same
 * timing the old mount-effect had, without setState-in-effect.
 *
 * The storage key, the read/write helpers and the change event live in
 * `lib/consent.ts`: the third-party ad renderer gates on the exact same flag,
 * so "declined" means no network tag anywhere on the site.
 */

/**
 * Cookie consent banner. The visitor's choice is stored locally and is
 * reusable from the public footer; network tags consult the same preference, so
 * declining is honoured permanently. The banner copy and the /about/privacy
 * advertising section (`components/about/advertising-disclosure.tsx`) are the
 * reader-facing half of that contract — the section names the partners that are
 * actually enabled.
 */
export function CookieBanner({ locale, dict }: { locale: Locale; dict: Dictionary }) {
    const unanswered = useSyncExternalStore(
        subscribeConsent,
        () => readConsent() === null,
        () => false,
    );
    const [dismissed, setDismissed] = useState(false);
    // Defer the first mount so the banner never covers the top of the fold on
    // a user's first view — reading comes first, consent stays available.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = window.setTimeout(() => setReady(true), 2000);
        return () => window.clearTimeout(t);
    }, []);

    function choose(value: ConsentValue) {
        writeConsent(value);
        setDismissed(true);
    }

    if (!ready || !unanswered || dismissed) return null;

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label={dict.footer.privacy}
            className="no-print fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-2xl rounded-2xl border bg-card p-4 shadow-lg md:p-5"
        >
            <p className="text-sm leading-relaxed text-muted-foreground">{dict.about.cookie.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => choose("accepted")}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    {dict.about.cookie.accept}
                </button>
                <button
                    type="button"
                    onClick={() => choose("declined")}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                    {dict.about.cookie.decline}
                </button>
                <Link
                    href={localePath(locale, "/about/privacy")}
                    className="ml-auto text-xs font-medium text-primary underline underline-offset-2"
                >
                    {dict.about.cookie.learnMore}
                </Link>
            </div>
        </div>
    );
}

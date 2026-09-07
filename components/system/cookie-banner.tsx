"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";

const STORAGE_KEY = "eea-consent";

/**
 * Consent flag as a tiny external store read via `useSyncExternalStore`.
 * The server snapshot reports "answered", so the banner never ships in the
 * SSR HTML; the real value is picked up right after hydration — the same
 * timing the old mount-effect had, without setState-in-effect.
 */
const consentListeners = new Set<() => void>();

function hasStoredConsent(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}

function subscribeConsent(listener: () => void) {
    consentListeners.add(listener);
    return () => {
        consentListeners.delete(listener);
    };
}

function notifyConsentListeners() {
    for (const listener of consentListeners) listener();
}

/**
 * Cookie consent banner (features.md Gap-Fill §19). A single preference flag
 * in localStorage — no ad trackers. Links into /about/privacy for the full
 * retention story.
 */
export function CookieBanner({ locale, dict }: { locale: Locale; dict: Dictionary }) {
    const unanswered = useSyncExternalStore(
        subscribeConsent,
        () => !hasStoredConsent(),
        () => false,
    );
    const [dismissed, setDismissed] = useState(false);

    function choose(value: "accepted" | "declined") {
        try {
            localStorage.setItem(STORAGE_KEY, value);
            notifyConsentListeners();
        } catch {
            /* storage unavailable — banner just hides for the session */
        }
        setDismissed(true);
    }

    if (!unanswered || dismissed) return null;

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label={dict.footer.privacy}
            className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border bg-card p-4 shadow-lg md:p-5"
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

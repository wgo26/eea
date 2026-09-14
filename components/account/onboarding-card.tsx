"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, Bookmark, PenLine, X } from "lucide-react";
import { localePath } from "@/lib/i18n/urls";
import type { Dictionary, Locale } from "@/lib/i18n";

const STORAGE_KEY = "eea-onboarding-dismissed";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function isDismissed(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

/**
 * First-run welcome card on the account dashboard: three steps (submit,
 * save, alerts) with direct links. Dismissible per browser; the server
 * snapshot reports "visible" so SSR matches the first client render.
 */
export function OnboardingCard({ locale, dict }: { locale: Locale; dict: Dictionary }) {
    const dismissed = useSyncExternalStore(subscribe, isDismissed, () => false);
    const t = dict.account.onboarding;

    if (dismissed) return null;

    function dismiss() {
        try {
            localStorage.setItem(STORAGE_KEY, "1");
        } catch {
            /* storage unavailable — hides for the session only */
        }
        for (const listener of listeners) listener();
    }

    const steps = [
        {
            icon: PenLine,
            title: t.stepSubmit,
            body: t.stepSubmitBody,
            cta: t.stepSubmitCta,
            href: localePath(locale, "/submit"),
        },
        {
            icon: Bookmark,
            title: t.stepSaved,
            body: t.stepSavedBody,
            cta: t.stepSavedCta,
            href: localePath(locale, "/"),
        },
        {
            icon: Bell,
            title: t.stepAlerts,
            body: t.stepAlertsBody,
            cta: t.stepAlertsCta,
            href: localePath(locale, "/account/notifications"),
        },
    ];

    return (
        <section className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold">{t.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label={t.dismiss}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <X className="h-4 w-4" aria-hidden />
                </button>
            </div>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
                {steps.map((step, i) => (
                    <li key={step.title} className="rounded-xl border border-border bg-card p-4">
                        <p className="flex items-center gap-2 text-sm font-bold">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {i + 1}
                            </span>
                            <step.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                            {step.title}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                        <Link
                            href={step.href}
                            className="mt-2.5 inline-flex text-xs font-bold text-link hover:underline"
                        >
                            {step.cta} →
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}

"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { readRecentViews, type RecentView } from "@/components/system/record-recent-view";

const EMPTY: RecentView[] = [];
let cachedRaw: string | null = null;
let cachedList: RecentView[] = EMPTY;

/**
 * Stable snapshot of the device-local reading history.
 *
 * `useSyncExternalStore` (rather than a lazy initializer or an effect) is the
 * only pattern here that is *both* hydration-safe and lint-clean: the server
 * snapshot is always empty, so the markup React rendered on the server matches
 * the first client paint, and React then re-renders with the real list. A lazy
 * initializer would differ across the two (mismatch), and setting state inside
 * an effect is rejected by react-hooks/set-state-in-effect.
 *
 * The cache keeps referential stability: the snapshot only changes when the
 * underlying storage string changes, so React never loops.
 */
function getSnapshot(): RecentView[] {
    try {
        const raw = localStorage.getItem("eea-recent");
        if (raw === cachedRaw) return cachedList;
        cachedRaw = raw;
        cachedList = readRecentViews();
        return cachedList;
    } catch {
        /* private mode / storage disabled */
        return EMPTY;
    }
}

function getServerSnapshot(): RecentView[] {
    return EMPTY;
}

function subscribe(onStoreChange: () => void): () => void {
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
}

/** Re-point a stored (locale-prefixed) href at the locale being read now. */
function localizedHref(href: string, locale: Locale): string {
    const stripped = href.replace(/^\/(en|fr)(?=\/|$)/, "");
    return localePath(locale, stripped || "/");
}

/**
 * W16 — "Continue reading" from the device-local history.
 *
 * The reader's own trail (written by RecordRecentView on every detail page) was
 * only reachable from /account/recent, which asks a logged-in-feeling question
 * of an anonymous visitor. This puts the same history back where the next
 * reading decision happens: the homepage. Nothing leaves the device, nothing is
 * sent to us, and the rail simply doesn't exist for a first-time visitor.
 */
export function ContinueReadingRail({ dict, locale }: { dict: Dictionary; locale: Locale }) {
    const views = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    if (views.length === 0) return null;
    const items = views.slice(0, 4);

    return (
        <section className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm md:p-6">
            <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {dict.home.continueReading}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{dict.home.continueReadingHint}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((view) => (
                    <li key={`${view.href}-${view.at}`}>
                        <Link
                            href={localizedHref(view.href, locale)}
                            className="group flex h-full flex-col gap-2 rounded-xl border border-border/70 bg-background p-2 transition-colors hover:border-primary/50"
                        >
                            {view.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={view.imageUrl}
                                    alt=""
                                    loading="lazy"
                                    className="h-24 w-full rounded-lg object-cover"
                                />
                            ) : null}
                            <span className="line-clamp-3 text-sm font-medium leading-snug group-hover:text-primary">
                                {view.title}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

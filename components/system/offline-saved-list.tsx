"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { readOfflineIndex, type SavedArticleRef } from "@/components/system/save-offline-button";

/**
 * Phase 4 — saved-articles list for the offline fallback page. Reads the
 * localStorage index written by SaveOfflineButton; every entry is backed by
 * the service worker's articles cache, so links resolve without a network.
 */
export function OfflineSavedList({
    title,
    empty,
}: {
    title: string;
    empty: string;
}) {
    const [items, setItems] = useState<SavedArticleRef[] | null>(null);

    useEffect(() => {
        // Deferred a frame so the SSR skeleton and the first client render
        // match (localStorage is client-only — no hydration mismatch).
        const id = requestAnimationFrame(() => setItems(readOfflineIndex()));
        return () => cancelAnimationFrame(id);
    }, []);

    if (items === null) {
        return <div aria-hidden className="animate-pulse rounded-2xl bg-muted p-4 text-sm">…</div>;
    }

    if (items.length === 0) {
        return (
            <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
                {empty}
            </div>
        );
    }

    return (
        <section aria-label={title} className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
            <ul className="grid gap-2">
                {items.map((item) => (
                    <li key={item.url}>
                        <Link
                            href={item.url}
                            className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40"
                        >
                            <Bookmark className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-primary">
                                {item.title}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

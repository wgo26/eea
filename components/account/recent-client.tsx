"use client";

import * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";

import { readRecentViews, type RecentView } from "@/components/system/record-recent-view";
import type { Dictionary } from "@/lib/i18n";

/** Phase 3 — recently viewed, rendered from device-local history. */
export function RecentClient({ dict }: { dict: Dictionary }) {
    const [views, setViews] = React.useState<RecentView[] | null>(() =>
        typeof window === "undefined" ? null : readRecentViews(),
    );

    function clear() {
        try {
            localStorage.removeItem("eea-recent");
        } catch { /* ignore */ }
        setViews([]);
    }

    if (views === null) {
        return <p className="text-sm text-muted-foreground">{dict.common.loading}</p>;
    }

    if (views.length === 0) {
        return <p className="text-sm text-muted-foreground">{dict.follow.recentEmpty}</p>;
    }

    return (
        <div className="space-y-4">
            <ul className="space-y-2">
                {views.map((v) => (
                    <li key={v.href} className="rounded-xl border border-border bg-card p-3">
                        <Link href={v.href} className="group flex items-center gap-3">
                            {v.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                            ) : null}
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium group-hover:underline">
                                    {v.title}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {new Date(v.at).toLocaleDateString()}
                                </span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
                <History className="h-3 w-3" aria-hidden />
                {dict.follow.clearRecent}
            </button>
        </div>
    );
}

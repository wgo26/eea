"use client";

import * as React from "react";
import Link from "next/link";
import { BellOff, MapPin, Tag } from "lucide-react";

import { toggleContentFollow, type OwnFollow } from "@/lib/follows/actions";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";

/** Phase 3 — own follows manager: unfollow places/topics in one tap. */
export function FollowsClient({
    initial,
    dict,
    locale,
}: {
    initial: OwnFollow[];
    dict: Dictionary;
    locale: Locale;
}) {
    const [rows, setRows] = React.useState(initial);
    const [busy, setBusy] = React.useState<string | null>(null);

    async function handleUnfollow(row: OwnFollow) {
        const id = row.kind === "place" ? row.locationId : row.categoryId;
        if (!id || busy) return;
        setBusy(id);
        const res = await toggleContentFollow(row.kind, id);
        setBusy(null);
        if (res.ok && !res.following) {
            setRows((r) => r.filter((x) => (row.kind === "place" ? x.locationId !== id : x.categoryId !== id)));
        }
    }

    if (rows.length === 0) {
        return <p className="text-sm text-muted-foreground">{dict.follow.manageEmpty}</p>;
    }

    return (
        <ul className="space-y-2">
            {rows.map((row) => {
                const id = row.kind === "place" ? row.locationId : row.categoryId;
                const name = row.kind === "place" ? row.locationName : row.categoryName;
                const href =
                    row.kind === "place" && row.locationSlug
                        ? localePath(locale, `/locations/${row.locationSlug}`)
                        : null;
                return (
                    <li
                        key={`${row.kind}:${id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                    >
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                            {row.kind === "place" ? (
                                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            ) : (
                                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            )}
                            {href && name ? (
                                <Link href={href} className="truncate font-medium hover:underline">
                                    {name}
                                </Link>
                            ) : (
                                <span className="truncate font-medium">{name ?? id}</span>
                            )}
                        </span>
                        <button
                            type="button"
                            disabled={busy === id}
                            onClick={() => handleUnfollow(row)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                            <BellOff className="h-3 w-3" aria-hidden />
                            {row.kind === "place" ? dict.follow.unfollowedPlace : dict.follow.unfollowedCategory}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import type { NearYouContent } from "@/lib/queries/locations";

const PLACE_COOKIE = "eea-place";

type UserPlace = { slug: string; name: string };

function readPlaceFromCookie(): UserPlace | null {
    try {
        const row = document.cookie
            .split("; ")
            .find((part) => part.startsWith(`${PLACE_COOKIE}=`));
        if (!row) return null;
        return JSON.parse(decodeURIComponent(row.split("=")[1])) as UserPlace;
    } catch {
        return null;
    }
}

/**
 * W16 — place-based identity on section pages.
 *
 * "Near you" used to exist only on the homepage. Every section page now honors
 * the same `eea-place` cookie with a rail of *that section's* content from the
 * reader's place, plus a one-tap escape into the fully filtered section
 * (`?location=<slug>`).
 *
 * It is a client island on purpose: reading the cookie on the server would opt
 * these ISR routes out of static rendering (the exact regression Phase 1 fixed
 * on the homepage — see HomeNearYouClient). The server shell stays cached; the
 * rail hydrates and fetches `/api/places?place=…&kind=…`.
 *
 * Rendering rules: nothing is shown without a chosen place, and nothing is
 * shown when that place has no content of this kind — a rail is only ever a
 * useful shortcut, never an empty box.
 */
export function PlaceRail({
    locale,
    dict,
    kind,
    sectionPath,
    limit = 4,
}: {
    locale: Locale;
    dict: Dictionary;
    /** content_type to narrow the rail to: news, notice, photo_story, listing, culture */
    kind: string;
    /** locale-free section path, e.g. "/news" — used for the "see all" link */
    sectionPath: string;
    limit?: number;
}) {
    // Client-only cookie: read in a lazy initializer so the server snapshot
    // (null) and the first client render agree — same pattern as
    // HomeNearYouClient and PlaceSelector.
    const [place] = useState<UserPlace | null>(() =>
        typeof document === "undefined" ? null : readPlaceFromCookie(),
    );
    const [content, setContent] = useState<NearYouContent[] | null>(null);

    useEffect(() => {
        if (!place) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(
                    `${localePath(locale, "/api/places")}?place=${encodeURIComponent(place.slug)}&kind=${encodeURIComponent(kind)}`,
                );
                if (!res.ok) return;
                const data = (await res.json()) as { content?: NearYouContent[] };
                if (!cancelled) setContent(data.content ?? []);
            } catch {
                // Rail stays hidden — never break a section page for this.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [kind, locale, place]);

    if (!place || !content || content.length === 0) return null;
    const items = content.slice(0, limit);

    return (
        <section
            aria-label={(dict.locations.nearYouTitle ?? "Latest from {place}").replace(
                "{place}",
                place.name,
            )}
            className="mb-8 rounded-2xl border border-border/70 bg-muted/30 p-4"
        >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {dict.locations.nearYou ?? "Near you"}
                    </p>
                    <h2 className="text-lg font-bold tracking-tight">
                        {(dict.locations.nearYouTitle ?? "Latest from {place}").replace(
                            "{place}",
                            place.name,
                        )}
                    </h2>
                </div>
                <Link
                    href={`${localePath(locale, sectionPath)}?location=${encodeURIComponent(place.slug)}`}
                    className="text-xs font-medium text-primary hover:underline"
                >
                    {(dict.locations.seeAllInPlace ?? "See all in {place}").replace(
                        "{place}",
                        place.name,
                    )}
                </Link>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((item) => (
                    <li key={item.id}>
                        <Link
                            href={item.href}
                            className="group flex h-full flex-col gap-2 rounded-xl border border-border/70 bg-card p-2 transition-colors hover:border-primary/50"
                        >
                            {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={item.imageUrl}
                                    alt=""
                                    loading="lazy"
                                    className="h-24 w-full rounded-lg object-cover"
                                />
                            ) : null}
                            <span className="line-clamp-3 text-sm font-medium leading-snug group-hover:text-primary">
                                {item.title}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

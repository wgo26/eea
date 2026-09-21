"use client";

import { useEffect, useState } from "react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import type { NearYouContent } from "@/lib/queries/locations";
import { StoryCard } from "@/components/home/story-card";

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
 * Phase 1 — client-side "Near You" rail.
 *
 * The place cookie used to be read with `cookies()` inside a server
 * component, which opted the whole homepage out of ISR. Now the static shell
 * renders first and this island reads the cookie + fetches the rail
 * client-side, so the page keeps `revalidate = 300`.
 */
export function HomeNearYouClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
    // The place cookie is client-only, so it is read in a lazy state
    // initializer instead of an effect. Calling setState synchronously inside
    // an effect schedules a second render before the first has committed
    // (react-hooks/set-state-in-effect), and there is nothing to gain: the
    // server snapshot is `null` either way and the guard below renders nothing
    // until content arrives, so the hydration output still matches.
    // Same pattern as PlaceSelector (components/locations/place-selector.tsx).
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
                    `${localePath(locale, "/api/places")}?place=${encodeURIComponent(place.slug)}`,
                );
                if (!res.ok) return;
                const data = (await res.json()) as { content?: NearYouContent[] };
                if (!cancelled) setContent(data.content ?? []);
            } catch {
                // Rail stays hidden — never break the homepage for this.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [locale, place]);

    if (!place || !content || content.length === 0) return null;

    return (
        <section className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {dict.locations.nearYou ?? "Near you"}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight">
                        {(dict.locations.nearYouTitle ?? "Latest from {place}").replace("{place}", place.name)}
                    </h2>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {content.map((item) => (
                    <StoryCard
                        key={item.id}
                        story={{
                            id: item.id,
                            type: item.type,
                            href: item.href,
                            title: item.title,
                            excerpt: null,
                            imageUrl: item.imageUrl,
                            location: item.location,
                            category: item.category,
                            credit: null,
                            verification: null,
                            publishedAt: item.publishedAt,
                        }}
                        dict={dict}
                        locale={locale}
                    />
                ))}
            </div>
        </section>
    );
}


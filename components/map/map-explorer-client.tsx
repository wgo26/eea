"use client";

import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n";
import { LocationMap, type MappedContent, type MappedHub } from "@/components/locations/location-map";

export type MapTypeFilter = { value: string; label: string; count: number };
export type MapPlaceFilter = { slug: string; name: string; count: number };

export type MapExplorerLabels = {
    filtersTitle: string;
    byType: string;
    byPlace: string;
    /** "{count}" placeholder replaced with the visible-pin count. */
    shownCount: string;
    noVisible: string;
};

/**
 * Interactive map explorer. The server page passes only pins that exist;
 * every control here filters that real dataset client-side — there are no
 * decorative checkboxes: type and place options are derived from the pins
 * themselves (a kind or place with zero stories never appears as a filter),
 * and the counters shown next to each option match the stories on the map.
 */
export function MapExplorerClient({
    hubs,
    pins,
    copy,
    labels,
    typeOptions,
    placeOptions,
}: {
    hubs: MappedHub[];
    pins: MappedContent[];
    copy: Dictionary["map"];
    labels: MapExplorerLabels;
    typeOptions: MapTypeFilter[];
    placeOptions: MapPlaceFilter[];
}) {
    const [activeTypes, setActiveTypes] = useState<Set<string>>(
        () => new Set(typeOptions.map((t) => t.value)),
    );
    const [activePlaces, setActivePlaces] = useState<Set<string>>(
        () => new Set(placeOptions.map((p) => p.slug)),
    );

    const visiblePins = useMemo(
        () =>
            pins.filter(
                (p) => activeTypes.has(p.type) && activePlaces.has(p.locationSlug ?? ""),
            ),
        [pins, activeTypes, activePlaces],
    );
    const visibleHubs = useMemo(() => {
        const withStories = new Set(
            visiblePins.map((p) => p.locationSlug).filter((s): s is string => Boolean(s)),
        );
        return hubs.filter((h) => withStories.has(h.slug));
    }, [hubs, visiblePins]);

    function toggleType(value: string) {
        setActiveTypes((prev) => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    }

    function togglePlace(slug: string) {
        setActivePlaces((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="lg:sticky lg:top-24 space-y-6">
                <Card className="p-4">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Filter className="h-4 w-4 text-primary" aria-hidden />
                            {labels.filtersTitle}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                {labels.byType}
                            </p>
                            {typeOptions.map((type) => (
                                <div key={type.value} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`type-${type.value}`}
                                        checked={activeTypes.has(type.value)}
                                        onCheckedChange={() => toggleType(type.value)}
                                    />
                                    <Label
                                        htmlFor={`type-${type.value}`}
                                        className="flex flex-1 cursor-pointer items-center justify-between text-sm"
                                    >
                                        <span>{type.label}</span>
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                            {type.count}
                                        </span>
                                    </Label>
                                </div>
                            ))}
                        </div>
                        {placeOptions.length > 0 ? (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                        {labels.byPlace}
                                    </p>
                                    <div className="max-h-48 space-y-1 overflow-y-auto">
                                        {placeOptions.map((place) => (
                                            <div key={place.slug} className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`loc-${place.slug}`}
                                                    checked={activePlaces.has(place.slug)}
                                                    onCheckedChange={() => togglePlace(place.slug)}
                                                />
                                                <Label
                                                    htmlFor={`loc-${place.slug}`}
                                                    className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-sm"
                                                >
                                                    <span className="truncate">{place.name}</span>
                                                    <span className="text-xs tabular-nums text-muted-foreground">
                                                        {place.count}
                                                    </span>
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </CardContent>
                </Card>
            </aside>

            <main className="min-w-0">
                <LocationMap hubs={visibleHubs} content={visiblePins} copy={copy} showClustering />
                <p className="mt-4 text-sm text-muted-foreground">
                    {labels.shownCount.replace("{count}", String(visiblePins.length))}
                </p>
                {visiblePins.length === 0 ? (
                    <p className="mt-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        {labels.noVisible}
                    </p>
                ) : null}
            </main>
        </div>
    );
}

export function MapExplorerFallback() {
    return (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <div className="hidden h-64 rounded-2xl border border-border bg-muted/40 lg:block" />
            <div className="h-80 w-full animate-pulse overflow-hidden rounded-2xl border border-border bg-muted md:h-96" />
        </div>
    );
}

import { MapPin, Layers } from "lucide-react";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale, type Dictionary } from "@/lib/i18n";
import { getMappedLocations, getAllLocations, getMappedContent } from "@/lib/queries/locations";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/og";
import type { MappedContent, MappedHub } from "@/components/locations/location-map";
import {
    MapExplorerClient,
    MapExplorerFallback,
    type MapPlaceFilter,
    type MapTypeFilter,
} from "@/components/map/map-explorer-client";
import { Suspense } from "react";

// Force dynamic rendering since this page uses Leaflet (client-only)
// Phase 1: Leaflet initialises in a useEffect (location-map.tsx) and the
// data reads are cached (getMappedLocations/getAllLocations/getMappedContent
// under CACHE_TAGS.locations), so the shell can prerender and revalidate.
// The map itself hydrates client-side behind <Suspense>.
export const revalidate = 300;

const TYPE_ORDER = ["news", "photo_story", "notice", "culture", "listing", "micro_story"] as const;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return {
        title: `${dict.map.title} — ${dict.nav.locations}`,
        description: dict.map.description,
        alternates: buildAlternates(locale, "/map"),
        openGraph: {
            title: `${dict.map.title} — ${dict.nav.locations}`,
            locale: locale === "fr" ? "fr_FR" : "en_GB",
            images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
        },
    };
}

export default async function MapPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    const [locations, allLocations, stories] = await Promise.all([
        getMappedLocations(),
        getAllLocations(),
        getMappedContent(locale, 400),
    ]);

    const hubs: MappedHub[] = locations
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) => ({
            slug: l.slug,
            name: l.name,
            latitude: Number(l.latitude),
            longitude: Number(l.longitude),
            href: localePath(locale, `/locations/${l.slug}`),
        }));

    // Phase 4.1 — clustered story pins: same-place stories share hub
    // coordinates, so spread them with a deterministic golden-angle spiral
    // (±2 km) instead of stacking exactly.
    const seenPerHub = new Map<string, number>();
    const pins: MappedContent[] = stories.map((s) => {
        const n = seenPerHub.get(s.locationSlug) ?? 0;
        seenPerHub.set(s.locationSlug, n + 1);
        const angle = (n * 2.399963) % (Math.PI * 2);
        const radius = 0.008 * Math.sqrt(n + 1);
        return {
            id: s.id,
            type: s.type,
            title: s.title,
            slug: s.id,
            latitude: s.latitude + Math.sin(angle) * radius,
            longitude: s.longitude + Math.cos(angle) * radius,
            href: s.href,
            imageUrl: s.imageUrl,
            publishedAt: s.publishedAt,
            category: s.category,
            locationSlug: s.locationSlug,
        };
    });

    // Filter options are derived from the pins that actually exist — every
    // checkbox controls real map content, and its counter matches what the
    // type/place contributes to the visible total. No decorative filters.
    const typeCounts = new Map<string, number>();
    const placeCounts = new Map<string, number>();
    const hubNames = new Map(hubs.map((h) => [h.slug, h.name]));
    for (const pin of pins) {
        typeCounts.set(pin.type, (typeCounts.get(pin.type) ?? 0) + 1);
        if (pin.locationSlug) {
            placeCounts.set(pin.locationSlug, (placeCounts.get(pin.locationSlug) ?? 0) + 1);
        }
    }
    const typeOptions: MapTypeFilter[] = [
        ...[...typeCounts.keys()].sort(
            (a, b) => TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number]) - TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number]),
        ),
    ].map((value) => ({
        value,
        label: getSearchLabel(dict, value),
        count: typeCounts.get(value) ?? 0,
    }));
    const placeOptions: MapPlaceFilter[] = [...placeCounts.entries()]
        .filter(([slug]) => hubNames.has(slug))
        .sort((a, b) => (hubNames.get(a[0]) ?? "").localeCompare(hubNames.get(b[0]) ?? ""))
        .slice(0, 30)
        .map(([slug, count]) => ({ slug, name: hubNames.get(slug) ?? slug, count }));

    const coverage = allLocations.reduce((sum, l) => sum + (l.contentCount ?? 0), 0);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
            <header className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {dict.map.title}
                        </div>
                        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                            {dict.map.heading}
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                            {dict.map.description}
                        </p>
                    </div>

                    <div className="grid w-full max-w-md gap-3 sm:grid-cols-3 lg:w-auto">
                        <StatBlock
                            label={dict.locations.statPlaces}
                            value={String(placeCounts.size)}
                            icon={<MapPin className="h-4 w-4" />}
                        />
                        <StatBlock
                            label={dict.locations.statItems}
                            value={String(pins.length)}
                            icon={<Layers className="h-4 w-4" />}
                        />
                        <StatBlock
                            label={dict.locations.statCoverage}
                            value={String(coverage)}
                            icon={<Layers className="h-4 w-4" />}
                        />
                    </div>
                </div>
            </header>

            <Suspense fallback={<MapExplorerFallback />}>
                <MapExplorerClient
                    hubs={hubs}
                    pins={pins}
                    copy={dict.map}
                    labels={{
                        filtersTitle: dict.map.filters,
                        byType: dict.map.byType,
                        byPlace: dict.map.byPlace,
                        shownCount: dict.map.shownCount,
                        noVisible: dict.map.noVisible,
                    }}
                    typeOptions={typeOptions}
                    placeOptions={placeOptions}
                />
            </Suspense>
        </div>
    );
}

function getSearchLabel(dict: Dictionary, type: string): string {
    switch (type) {
        case "photo_story":
            return dict.search.photoStories;
        case "micro_story":
            return dict.map.microStory;
        case "listing":
            return dict.search.buySell;
        case "notice":
            return dict.search.notices;
        default:
            return (dict.search as Record<string, string>)[type] ?? type;
    }
}

function StatBlock({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background/60 p-3 backdrop-blur-sm">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {icon}
            </div>
            <div className="text-2xl font-black tabular-nums">{value}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        </div>
    );
}
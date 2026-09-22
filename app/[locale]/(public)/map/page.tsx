import { notFound } from "next/navigation";
import { MapPin, Layers, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getMappedLocations, getAllLocations, getMappedContent } from "@/lib/queries/locations";
import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/og";
import { LocationMap, type MappedContent, type MappedHub } from "@/components/locations/location-map";
import type { Dictionary } from "@/lib/i18n";
import { Suspense } from "react";

// Force dynamic rendering since this page uses Leaflet (client-only)
// Phase 1: Leaflet initialises in a useEffect (location-map.tsx) and the
// data reads are cached (getMappedLocations/getAllLocations/getMappedContent
// under CACHE_TAGS.locations), so the shell can prerender and revalidate.
// The map itself hydrates client-side behind <Suspense>.
export const revalidate = 300;

type ContentType = "news" | "photo_story" | "notice" | "culture" | "listing" | "micro_story" | "all";

const CONTENT_TYPES: { value: ContentType; labelKey: keyof Dictionary["search"] }[] = [
    { value: "all", labelKey: "allTypes" },
    { value: "news", labelKey: "news" },
    { value: "photo_story", labelKey: "photoStories" },
    { value: "notice", labelKey: "notices" },
    { value: "culture", labelKey: "culture" },
    { value: "listing", labelKey: "buySell" },
];

function getSearchLabel(dict: Dictionary["search"], key: keyof Dictionary["search"]): string {
    return dict[key] ?? key;
}

function MapLoadingSkeleton() {
    return (
        <div className="z-0 h-80 w-full overflow-hidden rounded-2xl border border-border bg-muted md:h-96 animate-pulse" />
    );
}

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

    const typeIcons: Record<string, string> = {
        news: "📰",
        photo_story: "📸",
        notice: "📋",
        culture: "🎭",
        listing: "🛍️",
        micro_story: "👁️",
    };

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
        };
    });

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
                            value={String(locations.length)}
                            icon={<MapPin className="h-4 w-4" />}
                        />
                        <StatBlock
                            label={dict.locations.statCoverage}
                            value={String(allLocations.reduce((sum, l) => sum + (l.contentCount ?? 0), 0))}
                            icon={<Layers className="h-4 w-4" />}
                        />
                    </div>
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <aside className="lg:sticky lg:top-24 space-y-6">
                    <Card className="p-4">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Filter className="h-4 w-4 text-primary" aria-hidden />
                                    {dict.map.filters}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-2">
                                {CONTENT_TYPES.map((type) => (
                                    <div key={type.value} className="flex items-center gap-2">
                                        <Checkbox id={`type-${type.value}`} defaultChecked={type.value === "all"} />
                                        <Label htmlFor={`type-${type.value}`} className="text-sm cursor-pointer">
                                            {getSearchLabel(dict.search, type.labelKey)}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                            <Separator />
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    {dict.map.locationFilter}
                                </p>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    {allLocations
                                        .filter((l) => (l.contentCount ?? 0) > 0)
                                        .slice(0, 20)
                                        .map((location) => (
                                            <div key={location.slug} className="flex items-center gap-2">
                                                <Checkbox id={`loc-${location.slug}`} />
                                                <Label htmlFor={`loc-${location.slug}`} className="text-sm cursor-pointer truncate">
                                                    {location.name}
                                                </Label>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="p-4">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Layers className="h-4 w-4 text-primary" aria-hidden />
                                {dict.map.legend}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {Object.entries(typeIcons).map(([type, icon]) => (
                                <div key={type} className="flex items-center gap-2 text-sm">
                                    <span className="text-lg">{icon}</span>
                                    <span>{getSearchLabel(dict.search, type === "photo_story" ? "photoStories" : (type as keyof Dictionary["search"]))}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 text-sm pt-2 border-t">
                                <span className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center text-xs">
                                    12
                                </span>
                                <span>{dict.map.cluster}</span>
                            </div>
                        </CardContent>
                    </Card>
                </aside>

                <main className="min-w-0">
                    <Suspense fallback={<MapLoadingSkeleton />}>
                        <LocationMap
                            hubs={hubs}
                            content={pins}
                            copy={dict.map}
                            showClustering={true}
                        />
                    </Suspense>
                    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                            {hubs.length}                             {dict.map.hubsCount?.replace("{count}", String(hubs.length))}
                            {pins.length > 0 ? ` · ${dict.map.storiesOnMap.replace("{count}", String(pins.length))}` : ""}
                        </span>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Layers className="h-4 w-4" aria-hidden />
                            {dict.map.listView}
                        </Button>
                    </div>
                </main>
            </div>
        </div>
    );
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
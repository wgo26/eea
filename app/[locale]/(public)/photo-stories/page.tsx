import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { Camera, Eye, Images, MapPin } from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { PlaceRail } from "@/components/place/place-rail";
import { SectionHeader } from "@/components/home/section-header";
import { SmartImage, THUMB_SIZES } from "@/components/media/smart-image";
import { FeaturedSpotlight } from "@/components/photo-stories/featured-spotlight";
import { PhotoStoryCard } from "@/components/photo-stories/photo-story-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/og";
import { FollowTopicButton } from "@/components/system/follow-topic-button";
import { FacetFilter, type FilterGroup } from "@/components/shared/facet-filter";
import { EmptyStateWithCTA } from "@/components/system/empty-state-with-cta";
import { VerticalSearchSidebar } from "@/components/shared/vertical-search-sidebar";
import { getLocationsByContentType } from "@/lib/queries/locations";
import { LocationProvider } from "@/hooks/use-location-context";
import {
    getFeaturedPhotoStory,
    getMostViewedPhotoStories,
    getPhotoStories,
    getPhotoStoryCategories,
    getPhotoStoriesStats,
    getPhotoStoryYears,
    type PhotoStoryData,
} from "@/lib/queries/photo-stories";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    let ogImage: string | null = null;
    try {
        const featured = await getFeaturedPhotoStory();
        ogImage = featured?.imageUrl ?? null;
    } catch {
        ogImage = null;
    }
    return {
        title: dict.photoStories.title,
        description: dict.photoStories.tagline,
        alternates: buildAlternates(locale, "/photo-stories"),
        openGraph: {
            title: dict.photoStories.title,
            description: dict.photoStories.tagline,
            images: [{ url: ogImage ?? DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
        },
    };
}

type PhotoStoriesSearchParams = {
    q?: string | string[];
    category?: string | string[];
    location?: string | string[];
    year?: string | string[];
    page?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** Stable hrefs for pagination + facet links that preserve active filters. */
function buildCanonicalHref(params: {
    search?: string;
    category?: string;
    location?: string;
    year?: number;
    page?: number;
}): string {
    const qs = new URLSearchParams();
    if (params.search) qs.set("q", params.search);
    if (params.category) qs.set("category", params.category);
    if (params.location) qs.set("location", params.location);
    if (params.year) qs.set("year", String(params.year));
    if (params.page && params.page > 1) qs.set("page", String(params.page));
    const query = qs.toString();
    return query ? `/photo-stories?${query}` : "/photo-stories";
}

export default async function PhotoStoriesPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<PhotoStoriesSearchParams>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const hrefL = (args: Parameters<typeof buildCanonicalHref>[0]) => localePath(locale, buildCanonicalHref(args));

    const sp = await searchParams;
    const search = firstParam(sp.q)?.trim() || undefined;
    const category = firstParam(sp.category)?.trim() || undefined;
    const location = firstParam(sp.location)?.trim() || undefined;
    // Phase 3/P4 — archive year (visual-archive browsing, Differentiator #2).
    const yearRaw = Number.parseInt(firstParam(sp.year) ?? "", 10);
    const year =
        Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : undefined;
    const page = Math.max(
        1,
        Number.parseInt(firstParam(sp.page) ?? "1", 10) || 1,
    );
    const isFiltered = Boolean(search || category || location || year);
    const browseMode = !isFiltered && page === 1;

    let featured: Awaited<ReturnType<typeof getFeaturedPhotoStory>> = null;
    let list: { stories: PhotoStoryData[]; pageCount: number; total: number; page: number } = { stories: [], pageCount: 1, total: 0, page: 1 };
    let categories: Awaited<ReturnType<typeof getPhotoStoryCategories>> = [];
    let locations: Awaited<ReturnType<typeof getLocationsByContentType>> = [];
    let stats = { stories: 0, photos: 0, places: 0 };
    let mostViewed: Awaited<ReturnType<typeof getMostViewedPhotoStories>> = [];
    let years: Awaited<ReturnType<typeof getPhotoStoryYears>> = [];

    try {
        [featured, list, categories, locations, stats, mostViewed, years] = await Promise.all([
            getFeaturedPhotoStory(),
            getPhotoStories({ search, category, location, locale, page, year }),
            getPhotoStoryCategories(),
            getLocationsByContentType("photo_story"),
            getPhotoStoriesStats(),
            getMostViewedPhotoStories(locale, 5),
            getPhotoStoryYears(),
        ]);
    } catch (err) {
        console.error("[photo-stories] Data fetch failed:", err);
    }

    const { stories, pageCount } = list;
    const nextUp = featured ? stories.filter((s) => s.id !== featured.id).slice(0, 3) : [];

    // Compact page window when the archive grows past seven pages.
    const pages =
        pageCount <= 7
            ? Array.from({ length: pageCount }, (_, i) => i + 1)
            : [...new Set([1, page - 1, page, page + 1, pageCount])]
                .filter((p) => p >= 1 && p <= pageCount)
                .sort((a, b) => a - b);

    return (
        <LocationProvider
            locations={locations}
            activeLocation={location ?? null}
            locationHref={(slug) =>
                slug
                    ? hrefL({ search, category, year, location: slug })
                    : hrefL({ search, category, year })
            }
        >
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            {/* Page band */}
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Camera className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                            {dict.photoStories.title}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {dict.photoStories.tagline}
                        </p>
                    </div>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.photoStories.intro}
                </p>
            </header>

            {/* Archive stats strip */}
            {browseMode ? (
                <section
                    aria-label={dict.photoStories.latest}
                    className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-y py-3.5 text-sm text-muted-foreground"
                >
                    <span className="inline-flex items-center gap-2">
                        <Images className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">{stats.photos}</strong>
                        {dict.photoStories.photosLabel}
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <Camera className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">{stats.stories}</strong>
                        {dict.photoStories.storiesLabel}
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">{stats.places}</strong>
                        {dict.photoStories.placesLabel}
                    </span>
                </section>
            ) : null}

            {/* Featured spotlight */}
            {browseMode ? (
                <section className="mb-10">
                    <FeaturedSpotlight
                        featured={featured}
                        nextUp={nextUp}
                        dict={dict}
                        locale={locale}
                    />
                </section>
            ) : null}

            {/* W16 — place rail: the reader's chosen place, scoped to photo stories. */}
            <PlaceRail locale={locale} dict={dict} kind="photo_story" sectionPath="/photo-stories" />

            {/* Category filter — unified FacetFilter */}
            {categories.length > 0 ? (
                <FacetFilter
                    locale={locale}
                    labels={{
                        filterLabel: dict.photoStories.categories,
                        clearFilters: dict.photoStories.clearFilters,
                    }}
                    groups={[
                        {
                            key: "category",
                            label: dict.photoStories.categories,
                            activeKey: category ?? null,
                            allLabel: dict.photoStories.allCategories,
                            hrefFor: (k) =>
                                k ? hrefL({ search, location, year, category: k }) : hrefL({ search, location, year }),
                            facets: categories.map((f) => ({
                                key: f.slug,
                                label: f.name,
                                count: f.total,
                            })),
                        },
                        ...(years.length > 0
                            ? [
                                {
                                    key: "year",
                                    label: dict.photoStories.years,
                                    activeKey: year ? String(year) : null,
                                    allLabel: dict.photoStories.allYears,
                                    hrefFor: (k: string) =>
                                        k
                                            ? hrefL({ search, category, location, year: Number(k) })
                                            : hrefL({ search, category, location }),
                                    facets: years.map((y) => ({
                                        key: String(y),
                                        label: String(y),
                                    })),
                                } as FilterGroup,
                            ]
                            : []),
                        ...(locations.length > 0
                            ? [
                                {
                                    key: "location",
                                    label: dict.photoStories.locations,
                                    activeKey: location ?? null,
                                    allLabel: "All",
                                    hrefFor: (k: string) =>
                                        k ? hrefL({ search, category, year, location: k }) : hrefL({ search, category, year }),
                                    facets: locations.map((loc) => ({
                                        key: loc.slug,
                                        label: loc.name,
                                    })),
                                } as FilterGroup,
                            ]
                            : []),
                    ]}
                />
            ) : null}

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* Main column */}
                <div>
                    <SectionHeader
                        title={
                            isFiltered ? dict.photoStories.searchLabel : dict.photoStories.latest
                        }
                        hint={dict.home.sectionHintPhoto}
                    />
                    {/* Phase 3 — follow the active topic without leaving the filter. */}
                    {category ? (
                        (() => {
                            const facet = categories.find((f) => f.slug === category);
                            return facet ? (
                                <div className="mb-4">
                                    <FollowTopicButton kind="category" id={facet.id} name={facet.name} copy={dict.follow} />
                                </div>
                            ) : null;
                        })()
                    ) : null}
                    {stories.length === 0 ? (
                        <EmptyStateWithCTA
                            icon={Camera}
                            title={dict.photoStories.searchLabel}
                            body={isFiltered ? dict.photoStories.empty : dict.photoStories.comingSoon}
                            isFiltered={isFiltered}
                            ctaLabel={dict.photoStories.submitCtaButton}
                            ctaHref={localePath(locale, "/submit")}
                            clearHref={localePath(locale, "/photo-stories")}
                            clearLabel={dict.photoStories.clearFilters}
                        />
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            {stories.map((story) => (
                                <PhotoStoryCard
                                    key={story.id}
                                    story={story}
                                    dict={dict}
                                    locale={locale}
                                />
                            ))}
                        </div>
                    )}

                    {pageCount > 1 ? (
                        <Pagination className="mt-10">
                            <PaginationContent>
                                {page > 1 ? (
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href={hrefL({
                                                search,
                                                category,
                                                location,
                                                year,
                                                page: page - 1,
                                            })}
                                        />
                                    </PaginationItem>
                                ) : null}
                                {pages.map((p) => (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href={hrefL({ search, category, location, year, page: p })}
                                            isActive={p === page}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                ))}
                                {page < pageCount ? (
                                    <PaginationItem>
                                        <PaginationNext
                                            href={hrefL({
                                                search,
                                                category,
                                                location,
                                                year,
                                                page: page + 1,
                                            })}
                                        />
                                    </PaginationItem>
                                ) : null}
                            </PaginationContent>
                        </Pagination>
                    ) : null}
                </div>

                {/* Sidebar */}
                <aside className="space-y-6">
                <VerticalSearchSidebar
                    locale={locale}
                    actionPath="/photo-stories"
                    searchLabel={dict.nav.search}
                    searchPlaceholder={dict.photoStories.searchPlaceholder}
                    searchDefaultValue={search ?? ""}
                    hiddenParams={[
                        category ? { name: "category", value: category } : null,
                        location ? { name: "location", value: location } : null,
                        year ? { name: "year", value: String(year) } : null,
                    ].filter((p): p is { name: string; value: string } => p !== null)}
                    locations={locations}
                    locationLabel={dict.photoStories.locations}
                    allLocationsLabel={dict.photoStories.allLocations}
                    activeLocation={location ?? null}
                    locationHref={(slug) =>
                        slug
                            ? hrefL({ search, category, year, location: slug })
                            : hrefL({ search, category, year })
                    }
                    clearHref={localePath(locale, "/photo-stories")}
                    clearLabel={dict.photoStories.clearFilters}
                    isFiltered={isFiltered || page > 1}
                />

                {mostViewed.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {dict.photoStories.mostViewed}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ol className="space-y-1">
                                    {mostViewed.map((story, index) => (
                                        <li key={story.id}>
                                            <Link
                                                href={story.href}
                                                className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
                                            >
                                                <span className="w-4 shrink-0 text-sm font-black tabular-nums text-muted-foreground/50">
                                                    {index + 1}
                                                </span>
                                                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                    {story.imageUrl ? (
                                                        <SmartImage
                                                            src={story.imageUrl}
                                                            alt={story.title}
                                                            sizes={THUMB_SIZES}
                                                            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                                                        />
                                                    ) : null}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                                        {story.title}
                                                    </span>
                                                    {story.category ? (
                                                        <span className="mt-0.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                                            {story.category}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    ) : null}

                    <AdSlot
                        ad={null}
                        dict={dict}
                        variant="rail"
                        className="lg:sticky lg:top-24"
                    />

                    <Card>
                        <CardContent className="space-y-2">
                            <p className="text-sm font-bold">
                                {dict.photoStories.submitCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.photoStories.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.photoStories.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
        </LocationProvider>
    );
}
import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { Camera, Eye, Images, MapPin, Search } from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { FeaturedSpotlight } from "@/components/photo-stories/featured-spotlight";
import { PhotoStoryCard } from "@/components/photo-stories/photo-story-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
    getFeaturedPhotoStory,
    getMostViewedPhotoStories,
    getPhotoStories,
    getPhotoStoryCategories,
    getPhotoStoryLocations,
    getPhotoStoriesStats,
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
    page?: number;
}): string {
    const qs = new URLSearchParams();
    if (params.search) qs.set("q", params.search);
    if (params.category) qs.set("category", params.category);
    if (params.location) qs.set("location", params.location);
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
    const page = Math.max(
        1,
        Number.parseInt(firstParam(sp.page) ?? "1", 10) || 1,
    );
    const isFiltered = Boolean(search || category || location);
    const browseMode = !isFiltered && page === 1;

    const [featured, list, categories, locations, stats, mostViewed] = await Promise.all([
        getFeaturedPhotoStory(),
        getPhotoStories({ search, category, location, locale, page }),
        getPhotoStoryCategories(),
        getPhotoStoryLocations(),
        getPhotoStoriesStats(),
        getMostViewedPhotoStories(locale, 5),
    ]);
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

            {/* Category chips */}
            {categories.length > 0 ? (
                <nav
                    aria-label={dict.photoStories.categories}
                    className="mb-8 flex flex-wrap items-center gap-1.5"
                >
                    <Link
                        href={hrefL({ search, location })}
                        aria-current={!category ? "page" : undefined}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${category
                                ? "bg-muted text-muted-foreground hover:bg-accent"
                                : "bg-primary text-primary-foreground"
                            }`}
                    >
                        {dict.photoStories.allCategories}
                    </Link>
                    {categories.map((facet) => (
                        <Link
                            key={facet.id}
                            href={hrefL({ search, location, category: facet.slug })}
                            aria-current={category === facet.slug ? "page" : undefined}
                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${category === facet.slug
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                                }`}
                        >
                            {facet.name}
                            <span className="ml-1.5 tabular-nums opacity-70">{facet.total}</span>
                        </Link>
                    ))}
                </nav>
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
                    {stories.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-start gap-3 py-10 text-center sm:items-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Camera className="h-6 w-6" aria-hidden />
                                </span>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    {isFiltered
                                        ? dict.photoStories.empty
                                        : dict.photoStories.comingSoon}
                                </p>
                                {!isFiltered ? (
                                    <Button render={<Link href={localePath(locale, "/submit")} />}>
                                        {dict.photoStories.submitCtaButton}
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
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
                                                page: page - 1,
                                            })}
                                        />
                                    </PaginationItem>
                                ) : null}
                                {pages.map((p) => (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href={hrefL({ search, category, location, page: p })}
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
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                                {dict.photoStories.searchLabel}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                action={localePath(locale, "/photo-stories")}
                                method="GET"
                                role="search"
                                className="space-y-2"
                            >
                                {category ? (
                                    <input type="hidden" name="category" value={category} />
                                ) : null}
                                {location ? (
                                    <input type="hidden" name="location" value={location} />
                                ) : null}
                                <Input
                                    type="search"
                                    name="q"
                                    defaultValue={search ?? ""}
                                    placeholder={dict.photoStories.searchPlaceholder}
                                    aria-label={dict.photoStories.searchLabel}
                                />
                                <Button type="submit" className="w-full">
                                    <Search data-icon="inline-start" aria-hidden />
                                    {dict.nav.search}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

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
                                                        <span
                                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                                                            style={{
                                                                backgroundImage: `url(${story.imageUrl})`,
                                                            }}
                                                            role="img"
                                                            aria-label={story.title}
                                                        />
                                                    ) : null}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                                        {story.title}
                                                    </span>
                                                    {story.category ? (
                                                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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

                    {locations.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {dict.photoStories.locations}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="flex flex-wrap gap-1.5">
                                    {locations.map((loc) => (
                                        <li key={loc.slug}>
                                            <Link
                                                href={hrefL({
                                                    search,
                                                    category,
                                                    location: loc.slug,
                                                })}
                                                aria-current={location === loc.slug ? "page" : undefined}
                                                className={`inline-block rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted ${location === loc.slug
                                                        ? "border-primary bg-primary/10 font-semibold text-foreground"
                                                        : "text-muted-foreground"
                                                    }`}
                                            >
                                                {loc.name}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ) : null}

                    {isFiltered || page > 1 ? (
                        <Link href={localePath(locale, "/photo-stories")}>
                            <Button variant="outline" className="w-full">
                                {dict.photoStories.clearFilters}
                            </Button>
                        </Link>
                    ) : null}

                    <AdSlot
                        ad={null}
                        dict={dict}
                        advertiseHref={localePath(locale, "/advertise")}
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
    );
}
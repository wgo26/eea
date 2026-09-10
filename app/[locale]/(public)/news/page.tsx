import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import {
    CalendarClock,
    Eye,
    FileText,
    MapPin,
    Newspaper,
    PenLine,
    Search,
    TrendingUp,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { StoryCard } from "@/components/home/story-card";
import { FundraisingSection } from "@/components/news/fundraising-section";
import { LiveRail } from "@/components/news/live-rail";
import { NewsSpotlight } from "@/components/news/news-spotlight";
import { PollCard, PollEmpty } from "@/components/news/poll-card";
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
import { getFundraisers, getFundraiserStats } from "@/lib/queries/fundraisers";
import { getActivePolls } from "@/lib/queries/polls";
import {
    getDevelopingNews,
    getFeaturedNews,
    getMostViewedNews,
    getNewsArticles,
    getNewsCategories,
    getNewsLocations,
    getNewsStats,
} from "@/lib/queries/news";

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
        const featured = await getFeaturedNews(locale);
        ogImage = featured?.imageUrl ?? null;
    } catch {
        ogImage = null;
    }
    return {
        title: dict.news.title,
        description: dict.news.tagline,
        alternates: buildAlternates(locale, "/news"),
        openGraph: {
            title: dict.news.title,
            description: dict.news.tagline,
            images: [{ url: ogImage ?? DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
        },
    };
}

type NewsSearchParams = {
    q?: string | string[];
    category?: string | string[];
    location?: string | string[];
    sort?: string | string[];
    page?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** Stable hrefs for pagination, facets and sorting that preserve active filters. */
function buildCanonicalHref(params: {
    search?: string;
    category?: string;
    location?: string;
    sort?: string;
    page?: number;
}): string {
    const qs = new URLSearchParams();
    if (params.search) qs.set("q", params.search);
    if (params.category) qs.set("category", params.category);
    if (params.location) qs.set("location", params.location);
    if (params.sort && params.sort !== "newest") qs.set("sort", params.sort);
    if (params.page && params.page > 1) qs.set("page", String(params.page));
    const query = qs.toString();
    return query ? `/news?${query}` : "/news";
}

export default async function NewsPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<NewsSearchParams>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const hrefL = (args: Parameters<typeof buildCanonicalHref>[0]) => localePath(locale, buildCanonicalHref(args));
    const searchParamsResolved = await searchParams;
    const search = firstParam(searchParamsResolved.q)?.trim() || undefined;
    const category = firstParam(searchParamsResolved.category)?.trim() || undefined;
    const location = firstParam(searchParamsResolved.location)?.trim() || undefined;
    const sortParam = firstParam(searchParamsResolved.sort)?.trim();
    const sort: "newest" | "most_read" =
        sortParam === "most_read" ? "most_read" : "newest";
    const page = Math.max(1, Number.parseInt(firstParam(searchParamsResolved.page) ?? "1", 10) || 1);

    const isFiltered = Boolean(search || category || location);
    const browseMode = !isFiltered && page === 1;

    const [list, categories, locations, stats, mostViewed] = await Promise.all([
        getNewsArticles({ search, category, location, locale, page, sort }),
        getNewsCategories(),
        getNewsLocations(),
        getNewsStats(),
        getMostViewedNews(locale, 5),
    ]);
    const { articles, pageCount } = list;

    // Browse-only modules: the lead, the live rail, fundraising and polls all
    // belong to the front page of the section, not to a filtered result set.
    const [featured, developing, fundraisers, fundraiserStats, polls] = browseMode
        ? await Promise.all([
              getFeaturedNews(locale),
              getDevelopingNews(locale, 3),
              getFundraisers({ locale, limit: 3, onlyActive: true }),
              getFundraiserStats(),
              getActivePolls(2),
          ])
        : [null, [], [], { active: 0, totalRaised: 0, totalGoal: 0, currency: "XAF", completed: 0 }, []];

    const nextUp = featured
        ? articles.filter((a) => a.id !== featured.id).slice(0, 3)
        : [];
    const [featuredPoll, ...restPolls] = polls;
    const railPoll = restPolls[0] ?? null;

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
                <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Newspaper className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                            {dict.news.title}
                        </h1>
                        <p className="text-sm text-muted-foreground">{dict.news.tagline}</p>
                    </div>
                    {browseMode && stats.thisWeek > 0 ? (
                        <span className="ml-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold">
                            <span className="relative flex h-2 w-2" aria-hidden>
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                            {stats.thisWeek} {dict.news.thisWeek}
                        </span>
                    ) : null}
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.news.intro}
                </p>
            </header>

            {/* Stats strip — hidden on a wiped site so it never reads "0 more stories". */}
            {browseMode && (stats.articles > 0 || stats.places > 0 || stats.contributors > 0) ? (
                <section
                    aria-label={dict.news.latest}
                    className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-y py-3.5 text-sm text-muted-foreground"
                >
                    <span className="inline-flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">{stats.articles}</strong>
                        {dict.news.moreStories.toLowerCase()}
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">{stats.places}</strong>
                        {dict.news.locations.toLowerCase()}
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <PenLine className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">
                            {stats.contributors}
                        </strong>
                        {dict.news.reporters}
                    </span>
                    {fundraiserStats.active > 0 ? (
                        <span className="inline-flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                            <strong className="tabular-nums text-foreground">
                                {fundraiserStats.active}
                            </strong>
                            {dict.fundraisers.activeCampaigns}
                        </span>
                    ) : null}
                </section>
            ) : null}

            {/* Live & developing */}
            {browseMode ? (
                <div className="mb-8">
                    <LiveRail stories={developing} dict={dict} locale={locale} />
                </div>
            ) : null}

            {/* Featured lead */}
            {browseMode ? (
                <section className="mb-10">
                    <NewsSpotlight
                        featured={featured}
                        nextUp={nextUp}
                        dict={dict}
                        locale={locale}
                    />
                </section>
            ) : null}

            {/* Participation: community fundraising */}
            {browseMode ? (
                <div className="mb-12">
                    <FundraisingSection
                        campaigns={fundraisers}
                        dict={dict}
                        locale={locale}
                        stats={fundraiserStats}
                    />
                </div>
            ) : null}

            {/* Participation: community poll */}
            {browseMode ? (
                <section aria-labelledby="poll-heading" className="mb-12">
                    <div className="rounded-3xl border bg-muted/40 p-5 md:p-8">
                        <div className="mx-auto max-w-3xl">
                            <p
                                id="poll-heading"
                                className="mb-4 text-center text-[11px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground"
                            >
                                {dict.news.participation} — {dict.polls.tagline}
                            </p>
                            {featuredPoll ? (
                                <PollCard poll={featuredPoll} dict={dict} locale={locale} />
                            ) : (
                                <PollEmpty dict={dict} />
                            )}
                        </div>
                    </div>
                </section>
            ) : null}

            {/* Category chips */}
            {categories.length > 0 ? (
                <nav
                    aria-label={dict.news.categories}
                    className="mb-8 flex flex-wrap items-center gap-1.5"
                >
                    <Link
                        href={hrefL({ search, location, sort })}
                        aria-current={!category ? "page" : undefined}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${category
                                ? "bg-muted text-muted-foreground hover:bg-accent"
                                : "bg-primary text-primary-foreground"
                            }`}
                    >
                        {dict.news.allCategories}
                    </Link>
                    {categories.map((facet) => (
                        <Link
                            key={facet.id}
                            href={hrefL({ search, location, sort, category: facet.slug })}
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
                <div className="min-w-0">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
                        <h2 className="text-xl font-extrabold uppercase tracking-tight md:text-2xl">
                            {isFiltered ? dict.news.searchLabel : dict.news.latest}
                        </h2>
                        <div className="flex items-center gap-1.5">
                            <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
                                {dict.news.sortBy}
                            </span>
                            <Link
                                href={hrefL({ search, category, location })}
                                aria-current={sort === "newest" ? "page" : undefined}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${sort === "newest"
                                        ? "bg-foreground text-background"
                                        : "bg-muted text-muted-foreground hover:bg-accent"
                                    }`}
                            >
                                {dict.news.sortNewest}
                            </Link>
                            <Link
                                href={hrefL({ search, category, location, sort: "most_read" })}
                                aria-current={sort === "most_read" ? "page" : undefined}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${sort === "most_read"
                                        ? "bg-foreground text-background"
                                        : "bg-muted text-muted-foreground hover:bg-accent"
                                    }`}
                            >
                                <TrendingUp className="h-3 w-3" aria-hidden />
                                {dict.news.sortMostRead}
                            </Link>
                        </div>
                    </div>

                    {articles.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-start gap-3 py-10 text-center sm:items-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Newspaper className="h-6 w-6" aria-hidden />
                                </span>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    {isFiltered ? dict.news.empty : dict.news.comingSoon}
                                </p>
                                {!isFiltered ? (
                                    <Button render={<Link href={localePath(locale, "/submit")} />}>
                                        {dict.news.submitCtaButton}
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            {articles.map((article) => (
                                <StoryCard
                                    key={article.id}
                                    story={article}
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
                                                sort,
                                                page: page - 1,
                                            })}
                                        />
                                    </PaginationItem>
                                ) : null}
                                {pages.map((p) => (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href={hrefL({
                                                search,
                                                category,
                                                location,
                                                sort,
                                                page: p,
                                            })}
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
                                                sort,
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
                                {dict.news.searchLabel}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form action={localePath(locale, "/news")} method="GET" role="search" className="space-y-2">
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
                                    placeholder={dict.news.searchPlaceholder}
                                    aria-label={dict.news.searchLabel}
                                />
                                <Button type="submit" className="w-full">
                                    <Search data-icon="inline-start" aria-hidden />
                                    {dict.nav.search}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {railPoll ? (
                        <PollCard poll={railPoll} dict={dict} locale={locale} variant="rail" />
                    ) : null}

                    {mostViewed.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {dict.news.sortMostRead}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ol className="space-y-1">
                                    {mostViewed.map((article, index) => (
                                        <li key={article.id}>
                                            <Link
                                                href={article.href}
                                                className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
                                            >
                                                <span className="w-4 shrink-0 text-sm font-black tabular-nums text-muted-foreground/50">
                                                    {index + 1}
                                                </span>
                                                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                    {article.imageUrl ? (
                                                        <span
                                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                                                            style={{
                                                                backgroundImage: `url(${article.imageUrl})`,
                                                            }}
                                                            role="img"
                                                            aria-label={article.title}
                                                        />
                                                    ) : null}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                                        {article.title}
                                                    </span>
                                                    {article.category ? (
                                                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                            {article.category}
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
                                    {dict.news.locations}
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
                                                    sort,
                                                    location: loc.slug,
                                                })}
                                                aria-current={
                                                    location === loc.slug ? "page" : undefined
                                                }
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
                        <Link href={localePath(locale, "/news")}>
                            <Button variant="outline" className="w-full">
                                {dict.news.clearFilters}
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
                            <p className="text-sm font-bold">{dict.news.submitCtaTitle}</p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.news.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.news.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

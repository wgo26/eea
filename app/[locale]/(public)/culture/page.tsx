import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { CalendarDays, Landmark, Music, Palette, Search, Video, Utensils } from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
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
import {
    getCultureArticles,
    getFeaturedCulture,
    getUpcomingEvents,
} from "@/lib/queries/culture";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.culture.title,
        description: dict.culture.tagline,
        alternates: buildAlternates(locale, "/culture"),
    };
}

type CultureSearchParams = {
    q?: string | string[];
    category?: string | string[];
    location?: string | string[];
    page?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function buildHref(params: {
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
    return query ? `/culture?${query}` : "/culture";
}

const SUB_SECTIONS = [
    { slug: "music", label: "Music", icon: Music },
    { slug: "art", label: "Art", icon: Palette },
    { slug: "fashion", label: "Fashion", icon: Landmark },
    { slug: "events", label: "Events", icon: CalendarDays },
    { slug: "food", label: "Food", icon: Utensils },
    { slug: "film", label: "Film", icon: Video },
];

export default async function CulturePage({
    searchParams,
}: {
    searchParams: Promise<CultureSearchParams>;
}) {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const params = await searchParams;
    const search = firstParam(params.q)?.trim() || undefined;
    const category = firstParam(params.category)?.trim() || undefined;
    const location = firstParam(params.location)?.trim() || undefined;
    const page = Math.max(
        1,
        Number.parseInt(firstParam(params.page) ?? "1", 10) || 1,
    );
    const isFiltered = Boolean(search || category || location);
    const browseMode = !isFiltered && page === 1;

    const [featured, list, upcomingEvents] = await Promise.all([
        getFeaturedCulture(locale),
        getCultureArticles({ search, category, location, locale, page }),
        getUpcomingEvents(locale, 5),
    ]);
    const { articles, pageCount } = list;

    const pages =
        pageCount <= 7
            ? Array.from({ length: pageCount }, (_, i) => i + 1)
            : [...new Set([1, page - 1, page, page + 1, pageCount])]
                .filter((p) => p >= 1 && p <= pageCount)
                .sort((a, b) => a - b);

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-8 overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.22),transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.18),transparent_30%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.66))] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                            <Palette className="h-3.5 w-3.5" aria-hidden />
                            Culture & entertainment
                        </div>
                        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                            {dict.culture.title}
                        </h1>
                        <p className="mt-3 text-sm text-muted-foreground md:text-base">
                            {dict.culture.tagline}
                        </p>
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                            {dict.culture.intro}
                        </p>
                    </div>

                    <div className="grid w-full max-w-md gap-3 sm:grid-cols-3 lg:w-auto">
                        <StatBlock label="Scenes" value="6" icon={<Palette className="h-4 w-4" />} />
                        <StatBlock label="Events" value={String(upcomingEvents.length)} icon={<CalendarDays className="h-4 w-4" />} />
                        <StatBlock label="Fresh" value={String(articles.length || 12)} icon={<Music className="h-4 w-4" />} />
                    </div>
                </div>
            </header>

            <section className="mb-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card p-4 shadow-sm md:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Culture pulse
                            </p>
                            <h2 className="mt-2 text-2xl font-bold tracking-tight">Scene map</h2>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                            Active now
                        </span>
                    </div>

                    <div className="relative h-[260px] overflow-hidden rounded-[24px] border border-border/70 bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--muted)/0.22),hsl(var(--background)))]">
                        <div className="absolute inset-0 opacity-80">
                            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:28px_28px]" />
                            <div className="absolute left-[14%] top-[20%] h-24 w-24 rounded-full bg-violet-500/10 blur-3xl" />
                            <div className="absolute bottom-[18%] right-[12%] h-28 w-28 rounded-full bg-sky-500/10 blur-3xl" />
                        </div>

                        <div className="absolute inset-0">
                            {[
                                { left: "18%", top: "32%", label: "Music" },
                                { left: "38%", top: "19%", label: "Art" },
                                { left: "56%", top: "38%", label: "Food" },
                                { left: "72%", top: "26%", label: "Film" },
                                { left: "58%", top: "68%", label: "Events" },
                                { left: "82%", top: "60%", label: "Fashion" },
                            ].map((node, index) => (
                                <div
                                    key={`${node.label}-${index}`}
                                    className="absolute -translate-x-1/2 -translate-y-1/2"
                                    style={{ left: node.left, top: node.top }}
                                >
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background bg-primary shadow-sm" aria-hidden />
                                        <span className="rounded-full border border-border/70 bg-background/85 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm">
                                            {node.label}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                            This week
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {upcomingEvents.length > 0 ? (
                            upcomingEvents.slice(0, 4).map((event) => (
                                <Link
                                    key={event.id}
                                    href={event.href}
                                    className="block rounded-2xl border border-border/70 bg-muted/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted/60"
                                >
                                    {event.eventDate ? (
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                                            {new Date(event.eventDate).toLocaleDateString()}
                                        </p>
                                    ) : null}
                                    <p className="mt-2 text-sm font-semibold leading-snug">{event.title}</p>
                                    {event.venue ? (
                                        <p className="mt-1 text-xs text-muted-foreground">{event.venue}</p>
                                    ) : null}
                                </Link>
                            ))
                        ) : (
                            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                                New events are being curated for the next community calendar.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            {/* Sub-section navigation */}
            <nav
                aria-label={dict.culture.subSections}
                className="mb-8 flex flex-wrap items-center gap-2"
            >
                {SUB_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    const isActive = category === section.slug;
                    return (
                        <Link
                            key={section.slug}
                            href={buildHref({ search, location, category: section.slug })}
                            aria-current={isActive ? "page" : undefined}
                            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                                isActive
                                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                    : "border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/30 hover:bg-accent"
                            }`}
                        >
                            <Icon className="h-4 w-4" aria-hidden />
                            {section.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Featured spotlight */}
            {browseMode && featured ? (
                <section className="mb-10">
                    <Link
                        href={featured.href}
                        className="group block overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-sm"
                    >
                        <div className="relative aspect-[16/7] overflow-hidden bg-muted md:aspect-[16/6]">
                            {featured.imageUrl ? (
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.03]"
                                    style={{ backgroundImage: `url(${featured.imageUrl})` }}
                                    role="img"
                                    aria-label={featured.title}
                                />
                            ) : null}
                            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden />
                            <span className="absolute inset-x-0 bottom-0 p-6 md:p-8">
                                <span className="inline-block rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary-foreground">
                                    {dict.culture.featured}
                                </span>
                                <h2 className="mt-3 text-2xl font-extrabold text-white md:text-4xl">
                                    {featured.title}
                                </h2>
                                {featured.excerpt ? (
                                    <p className="mt-2 max-w-2xl line-clamp-2 text-sm text-white/80 md:text-base">
                                        {featured.excerpt}
                                    </p>
                                ) : null}
                                <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-white/90">
                                    {dict.hero.readStory}
                                </span>
                            </span>
                        </div>
                    </Link>
                </section>
            ) : null}

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* Main column */}
                <div>
                    <SectionHeader
                        title={isFiltered ? dict.culture.searchLabel : dict.culture.latest}
                        hint={dict.home.sectionHintCulture}
                    />
                    {articles.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-start gap-3 py-10 text-center sm:items-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Palette className="h-6 w-6" aria-hidden />
                                </span>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    {isFiltered
                                        ? dict.culture.empty
                                        : dict.culture.comingSoon}
                                </p>
                                {!isFiltered ? (
                                    <Button render={<Link href={localePath(locale, "/submit")} />}>
                                        {dict.culture.submitCtaButton}
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            {articles.map((article) => (
                                <Link
                                    key={article.id}
                                    href={article.href}
                                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                                >
                                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                                        {article.imageUrl ? (
                                            <div
                                                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.05]"
                                                style={{ backgroundImage: `url(${article.imageUrl})` }}
                                                role="img"
                                                aria-label={article.title}
                                            />
                                        ) : null}
                                        {article.category ? (
                                            <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                                                {article.category}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-1 flex-col p-4">
                                        <h3 className="line-clamp-2 text-base font-bold leading-snug tracking-tight group-hover:text-primary">
                                            {article.title}
                                        </h3>
                                        {article.excerpt ? (
                                            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                                                {article.excerpt}
                                            </p>
                                        ) : null}
                                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-3 text-xs text-muted-foreground">
                                            {article.location ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <Landmark className="h-3 w-3" aria-hidden />
                                                    {article.location}
                                                </span>
                                            ) : null}
                                            {article.publishedAt ? (
                                                <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    {pageCount > 1 ? (
                        <Pagination className="mt-10">
                            <PaginationContent>
                                {page > 1 ? (
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href={buildHref({
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
                                            href={buildHref({ search, category, location, page: p })}
                                            isActive={p === page}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                ))}
                                {page < pageCount ? (
                                    <PaginationItem>
                                        <PaginationNext
                                            href={buildHref({
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
                    {/* Search */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                                {dict.culture.searchLabel}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                action={localePath(locale, "/culture")}
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
                                    placeholder={dict.culture.searchPlaceholder}
                                    aria-label={dict.culture.searchLabel}
                                />
                                <Button type="submit" className="w-full">
                                    <Search data-icon="inline-start" aria-hidden />
                                    {dict.nav.search}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Upcoming Events */}
                    {upcomingEvents.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {dict.culture.upcomingEvents}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    {upcomingEvents.map((event) => (
                                        <li key={event.id}>
                                            <Link
                                                href={event.href}
                                                className="group block rounded-xl p-2 transition-colors hover:bg-muted"
                                            >
                                                {event.eventDate ? (
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                                                        {new Date(event.eventDate).toLocaleDateString()}
                                                    </span>
                                                ) : null}
                                                <span className="mt-1 line-clamp-2 block text-sm font-semibold group-hover:underline">
                                                    {event.title}
                                                </span>
                                                {event.venue ? (
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                        {event.venue}
                                                    </span>
                                                ) : null}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ) : null}

                    {/* Clear filters */}
                    {isFiltered || page > 1 ? (
                        <Link href={localePath(locale, "/culture")}>
                            <Button variant="outline" className="w-full">
                                {dict.culture.clearFilters}
                            </Button>
                        </Link>
                    ) : null}

                    {/* Ad slot */}
                    <AdSlot
                        ad={null}
                        dict={dict}
                        advertiseHref="/advertise"
                        variant="rail"
                        className="lg:sticky lg:top-24"
                    />

                    {/* Submit CTA */}
                    <Card>
                        <CardContent className="space-y-2">
                            <p className="text-sm font-bold">
                                {dict.culture.submitCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.culture.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.culture.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
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
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        </div>
    );
}

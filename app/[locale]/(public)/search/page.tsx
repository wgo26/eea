import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { CalendarDays, MapPin, Search as SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, getDictionary, resolveLocale, type Dictionary, type Locale } from "@/lib/i18n";
import { getSearchResults, type SearchResultItem } from "@/lib/queries/search";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    return {
        title: dict.search.title,
        robots: { index: false, follow: true },
        alternates: buildAlternates(locale, "/search"),
    };
}

type SearchParams = { q?: string | string[]; type?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** Maps a content type to its localized group label. */
function typeLabel(type: string, dict: Dictionary): string {
    switch (type) {
        case "photo_story":
            return dict.search.photoStories;
        case "news":
            return dict.search.news;
        case "notice":
            return dict.search.notices;
        case "listing":
            return dict.search.buySell;
        case "culture":
            return dict.search.culture;
        default:
            return dict.search.allTypes;
    }
}

function ResultRow({
    item,
    dict,
    locale,
}: {
    item: SearchResultItem;
    dict: Dictionary;
    locale: Locale;
}) {
    return (
        <Link href={localePath(locale, item.href)} className="group block">
            <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <div className="flex items-stretch gap-3">
                    {item.imageUrl ? (
                        <span
                            className="h-24 w-24 shrink-0 self-stretch bg-cover bg-center sm:w-32"
                            style={{ backgroundImage: `url(${item.imageUrl})` }}
                            role="img"
                            aria-label={item.title}
                        />
                    ) : (
                        <span className="w-24 shrink-0 bg-muted sm:w-32" />
                    )}
                    <div className="min-w-0 flex-1 p-3">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                            {item.title}
                        </h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="font-medium uppercase tracking-wide text-primary/80">
                                {typeLabel(item.type, dict)}
                            </span>
                            {item.location ? (
                                <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" aria-hidden />
                                    {item.location}
                                </span>
                            ) : null}
                            {item.publishedAt ? (
                                <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" aria-hidden />
                                    {formatDate(item.publishedAt, locale)}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>
            </Card>
        </Link>
    );
}

const TYPE_TABS: { value: string | null; label: string }[] = [
    { value: null, label: "allTypes" },
    { value: "photo_story", label: "photoStories" },
    { value: "news", label: "news" },
    { value: "notice", label: "notices" },
    { value: "listing", label: "buySell" },
    { value: "culture", label: "culture" },
];

export default async function SearchPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<SearchParams>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const sp = await searchParams;
    const q = first(sp.q)?.trim() || "";
    const type = first(sp.type)?.trim() || null;

    const results = q ? await getSearchResults({ q, type, locale }) : null;

    const GROUP_TITLES: Record<string, string> = {
        photoStories: dict.search.photoStories,
        news: dict.search.news,
        notices: dict.search.notices,
        listings: dict.search.buySell,
        culture: dict.search.culture,
    };

    const groups: { key: string; items: SearchResultItem[] }[] = results
        ? [
              { key: "photoStories", items: results.photoStories },
              { key: "news", items: results.news },
              { key: "notices", items: results.notices },
              { key: "listings", items: results.listings },
              { key: "culture", items: results.culture },
          ].filter((g) => g.items.length > 0)
        : [];

    const typeParam = type ?? "";

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-6">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                    {dict.search.title}
                </h1>
            </header>

            {/* Search form */}
            <form action={localePath(locale, "/search")} method="GET" role="search" className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        type="search"
                        name="q"
                        defaultValue={q}
                        placeholder={dict.search.placeholder}
                        aria-label={dict.search.title}
                        className="flex-1"
                    />
                    <Button type="submit">
                        <SearchIcon className="h-4 w-4" aria-hidden />
                        {dict.nav.search}
                    </Button>
                </div>
                {type ? <input type="hidden" name="type" value={type} /> : null}
            </form>

            {/* Type filter chips */}
            {q ? (
            <nav aria-label={dict.search.filterType} className="mt-4 flex flex-wrap gap-1.5">
                {TYPE_TABS.map((tab) => {
                    const active = (tab.value ?? "") === typeParam;
                    const href = localePath(
                        locale,
                        tab.value
                            ? `/search?q=${encodeURIComponent(q)}&type=${tab.value}`
                            : `/search?q=${encodeURIComponent(q)}`,
                    );
                    const label =
                        tab.label === "allTypes"
                            ? dict.search.allTypes
                            : dict.search[tab.label as "photoStories"];
                    return (
                        <Link
                            key={tab.label}
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                                active
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                            }`}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>
            ) : null}

            {/* Results */}
            <div className="mt-8">
                {!q ? (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {dict.search.placeholder}
                    </p>
                ) : groups.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center">
                        <p className="font-semibold">
                            {dict.search.noResults.replace("{query}", q)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {dict.search.noResultsHint}
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="mb-4 text-sm text-muted-foreground">
                            {dict.search.resultsFor.replace("{query}", q)}
                        </p>
                        <div className="space-y-8">
                            {groups.map((group) => (
                                <section key={group.key}>
                                    <h2 className="mb-3 text-lg font-extrabold">
                                        {GROUP_TITLES[group.key]}
                                    </h2>
                                    <div className="space-y-3">
                                        {group.items.map((item) => (
                                            <ResultRow
                                                key={item.id}
                                                item={item}
                                                dict={dict}
                                                locale={locale}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

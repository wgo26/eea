import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { ShoppingBag, Search, MapPin, Tag, DollarSign, Plus } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import {
    getFeaturedListing,
    getListings,
} from "@/lib/queries/buy-sell";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    return {
        title: dict.buySell.title,
        description: dict.buySell.tagline,
        alternates: buildAlternates(locale, "/buy-sell"),
    };
}

type BuySellSearchParams = {
    q?: string | string[];
    category?: string | string[];
    location?: string | string[];
    sort?: string | string[];
    page?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function buildHref(params: {
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
    return query ? `/buy-sell?${query}` : "/buy-sell";
}

const CATEGORY_SLUGS = [
    { slug: "phones-electronics", key: "categoryPhones" as const },
    { slug: "vehicles", key: "categoryVehicles" as const },
    { slug: "property", key: "categoryProperty" as const },
    { slug: "furniture", key: "categoryFurniture" as const },
    { slug: "fashion", key: "categoryFashion" as const },
    { slug: "jobs-services", key: "categoryJobs" as const },
    { slug: "agriculture", key: "categoryAgriculture" as const },
    { slug: "household", key: "categoryHousehold" as const },
    { slug: "business-equipment", key: "categoryBusiness" as const },
    { slug: "other", key: "categoryOther" as const },
];

function formatPrice(amount: number | null | undefined, currency: string | null | undefined): string {
    if (amount == null || amount === 0) return "";
    const cur = currency ?? "XAF";
    try {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: cur,
            maximumFractionDigits: 0,
        }).format(amount);
    } catch {
        return `${amount.toLocaleString()} ${cur}`;
    }
}

export default async function BuySellPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<BuySellSearchParams>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    const params = await searchParams;
    const search = firstParam(params.q)?.trim() || undefined;
    const category = firstParam(params.category)?.trim() || undefined;
    const location = firstParam(params.location)?.trim() || undefined;
    const sort = (firstParam(params.sort)?.trim() as "newest" | "price_asc" | "price_desc") || "newest";
    const page = Math.max(
        1,
        Number.parseInt(firstParam(params.page) ?? "1", 10) || 1,
    );
    const isFiltered = Boolean(search || category || location || sort !== "newest");

    const [featured, list] = await Promise.all([
        getFeaturedListing(locale),
        getListings({ search, category, location, sort, locale, page }),
    ]);
    const { listings, pageCount, total } = list;

    const pages =
        pageCount <= 7
            ? Array.from({ length: pageCount }, (_, i) => i + 1)
            : [...new Set([1, page - 1, page, page + 1, pageCount])]
                .filter((p) => p >= 1 && p <= pageCount)
                .sort((a, b) => a - b);

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            {/* Page header */}
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <ShoppingBag className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                            {dict.buySell.title}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {dict.buySell.tagline}
                        </p>
                    </div>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.buySell.intro}
                </p>
            </header>

            {/* Category chips */}
            <nav
                aria-label={dict.buySell.categories}
                className="mb-8 flex flex-wrap items-center gap-1.5"
            >
                <Link
                    href={buildHref({ search, location, sort })}
                    aria-current={!category ? "page" : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                        !category
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                >
                    {dict.buySell.allCategories}
                </Link>
                {CATEGORY_SLUGS.map(({ slug, key }) => (
                    <Link
                        key={slug}
                        href={buildHref({ search, location, sort, category: slug })}
                        aria-current={category === slug ? "page" : undefined}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                            category === slug
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                    >
                        {dict.buySell[key]}
                    </Link>
                ))}
            </nav>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* Main column */}
                <div>
                    {/* Sort + count bar */}
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                        <SectionHeader
                            title={isFiltered ? dict.buySell.searchLabel : dict.buySell.latest}
                            hint={dict.home.sectionHintBuySell}
                        />
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                {total} {total === 1 ? "listing" : "listings"}
                            </span>
                            <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-xs font-semibold text-muted-foreground">
                                <Tag className="h-3 w-3" aria-hidden />
                                {dict.buySell.sortBy}:
                                <Link
                                    href={buildHref({ search, category, location, sort: "newest" })}
                                    className={`ml-1 transition-colors ${sort === "newest" ? "text-foreground" : "hover:text-foreground"}`}
                                >
                                    {dict.buySell.sortNewest}
                                </Link>
                                <span className="text-border">·</span>
                                <Link
                                    href={buildHref({ search, category, location, sort: "price_asc" })}
                                    className={`transition-colors ${sort === "price_asc" ? "text-foreground" : "hover:text-foreground"}`}
                                >
                                    {dict.buySell.sortPriceAsc}
                                </Link>
                                <span className="text-border">·</span>
                                <Link
                                    href={buildHref({ search, category, location, sort: "price_desc" })}
                                    className={`transition-colors ${sort === "price_desc" ? "text-foreground" : "hover:text-foreground"}`}
                                >
                                    {dict.buySell.sortPriceDesc}
                                </Link>
                            </span>
                        </div>
                    </div>

                    {/* Featured listing spotlight (only on unfiltered first page) */}
                    {!isFiltered && featured ? (
                        <Link
                            href={featured.href}
                            className="group mb-8 block overflow-hidden rounded-2xl border transition-colors hover:bg-muted/30"
                        >
                            <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
                                <div className="relative aspect-[4/3] overflow-hidden bg-muted sm:aspect-auto sm:h-full">
                                    {featured.imageUrl ? (
                                        <div
                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
                                            style={{ backgroundImage: `url(${featured.imageUrl})` }}
                                            role="img"
                                            aria-label={featured.title}
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center">
                                            <ShoppingBag className="h-10 w-10 text-muted-foreground/30" aria-hidden />
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col justify-center p-4 sm:p-5">
                                    <Badge className="w-fit">{dict.buySell.featured}</Badge>
                                    <h2 className="mt-3 text-xl font-extrabold leading-snug group-hover:underline md:text-2xl">
                                        {featured.title}
                                    </h2>
                                    {featured.excerpt ? (
                                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                                            {featured.excerpt}
                                        </p>
                                    ) : null}
                                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                        {featured.price != null && featured.price > 0 ? (
                                            <span className="inline-flex items-center gap-1 font-bold text-foreground">
                                                <DollarSign className="h-4 w-4 text-primary" aria-hidden />
                                                {formatPrice(featured.price, featured.currency)}
                                            </span>
                                        ) : (
                                            <span className="font-bold text-primary">{dict.buySell.free}</span>
                                        )}
                                        {featured.location ? (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin className="h-3.5 w-3.5" aria-hidden />
                                                {featured.location}
                                            </span>
                                        ) : null}
                                        {featured.category ? (
                                            <span className="inline-flex items-center gap-1">
                                                <Tag className="h-3.5 w-3.5" aria-hidden />
                                                {featured.category}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ) : null}

                    {/* Listings grid */}
                    {listings.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-start gap-3 py-10 text-center sm:items-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <ShoppingBag className="h-6 w-6" aria-hidden />
                                </span>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    {isFiltered ? dict.buySell.empty : dict.buySell.comingSoon}
                                </p>
                                {!isFiltered ? (
                                    <Button render={<Link href={localePath(locale, "/buy-sell/post")} />}>
                                        {dict.buySell.postListingCtaButton}
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {listings.map((listing) => (
                                <Link
                                    key={listing.id}
                                    href={listing.href}
                                    className="group flex flex-col overflow-hidden rounded-2xl border transition-colors hover:bg-muted/30"
                                >
                                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                                        {listing.imageUrl ? (
                                            <div
                                                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                                                style={{ backgroundImage: `url(${listing.imageUrl})` }}
                                                role="img"
                                                aria-label={listing.title}
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center">
                                                <ShoppingBag className="h-8 w-8 text-muted-foreground/30" aria-hidden />
                                            </div>
                                        )}
                                        {listing.price != null && listing.price > 0 ? (
                                            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
                                                {formatPrice(listing.price, listing.currency)}
                                            </span>
                                        ) : (
                                            <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                                                {dict.buySell.free}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-1 flex-col gap-1 p-3">
                                        <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:underline">
                                            {listing.title}
                                        </h3>
                                        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            {listing.location ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" aria-hidden />
                                                    {listing.location}
                                                </span>
                                            ) : null}
                                            {listing.category ? (
                                                <span className="inline-flex items-center gap-1">
                                                    <Tag className="h-3 w-3" aria-hidden />
                                                    {listing.category}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {pageCount > 1 ? (
                        <Pagination className="mt-10">
                            <PaginationContent>
                                {page > 1 ? (
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href={buildHref({ search, category, location, sort, page: page - 1 })}
                                        />
                                    </PaginationItem>
                                ) : null}
                                {pages.map((p) => (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href={buildHref({ search, category, location, sort, page: p })}
                                            isActive={p === page}
                                        >
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                ))}
                                {page < pageCount ? (
                                    <PaginationItem>
                                        <PaginationNext
                                            href={buildHref({ search, category, location, sort, page: page + 1 })}
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
                                {dict.buySell.searchLabel}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                action={localePath(locale, "/buy-sell")}
                                method="GET"
                                role="search"
                                className="space-y-2"
                            >
                                {category ? <input type="hidden" name="category" value={category} /> : null}
                                {location ? <input type="hidden" name="location" value={location} /> : null}
                                {sort !== "newest" ? <input type="hidden" name="sort" value={sort} /> : null}
                                <Input
                                    type="search"
                                    name="q"
                                    defaultValue={search ?? ""}
                                    placeholder={dict.buySell.searchPlaceholder}
                                    aria-label={dict.buySell.searchLabel}
                                />
                                <Button type="submit" className="w-full">
                                    <Search data-icon="inline-start" aria-hidden />
                                    {dict.nav.search}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <AdSlot
                        ad={null}
                        dict={dict}
                        advertiseHref="/advertise"
                        variant="rail"
                        className="lg:sticky lg:top-24"
                    />

                    <Card>
                        <CardContent className="space-y-2">
                            <p className="text-sm font-bold">
                                {dict.buySell.postListingCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.buySell.postListingCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/buy-sell/post")} />} className="w-full">
                                <Plus data-icon="inline-start" aria-hidden />
                                {dict.buySell.postListingCtaButton}
                            </Button>
                        </CardContent>
                    </Card>

                    {isFiltered ? (
                        <Link href={localePath(locale, "/buy-sell")}>
                            <Button variant="outline" className="w-full">
                                {dict.buySell.clearFilters}
                            </Button>
                        </Link>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}

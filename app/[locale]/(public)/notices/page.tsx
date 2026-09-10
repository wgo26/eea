import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { AlertTriangle, MapPin, Search } from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { VerificationBadge } from "@/components/verification-badge";
import { Badge } from "@/components/ui/badge";
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
import { getDictionary, resolveLocale, formatDate } from "@/lib/i18n";
import {
    getNotices,
    getFeaturedNotice,
    getNoticeTypes,
    getNoticesLocations,
    NOTICE_TYPE_LABELS,
} from "@/lib/queries/notices";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    return {
        title: dict.notices.title,
        description: dict.notices.tagline,
        alternates: buildAlternates(locale, "/notices"),
    };
}

type NoticesSearchParams = {
    q?: string | string[];
    type?: string | string[];
    location?: string | string[];
    status?: string | string[];
    page?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function buildCanonicalHref(params: {
    search?: string;
    type?: string;
    location?: string;
    status?: string;
    page?: number;
}): string {
    const qs = new URLSearchParams();
    if (params.search) qs.set("q", params.search);
    if (params.type) qs.set("type", params.type);
    if (params.location) qs.set("location", params.location);
    if (params.status && params.status !== "active") qs.set("status", params.status);
    if (params.page && params.page > 1) qs.set("page", String(params.page));
    const query = qs.toString();
    return query ? `/notices?${query}` : "/notices";
}

export default async function NoticesPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<NoticesSearchParams>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const hrefL = (args: Parameters<typeof buildCanonicalHref>[0]) => localePath(locale, buildCanonicalHref(args));

    const searchParamsResolved = await searchParams;
    const search = firstParam(searchParamsResolved.q)?.trim() || undefined;
    const noticeType = firstParam(searchParamsResolved.type)?.trim() || undefined;
    const location = firstParam(searchParamsResolved.location)?.trim() || undefined;
    const rawStatus = firstParam(searchParamsResolved.status)?.trim();
    const status: "all" | "active" | "expiring" | "expired" =
        rawStatus === "all" || rawStatus === "expiring" || rawStatus === "expired"
            ? rawStatus
            : "active";
    const page = Math.max(
        1,
        Number.parseInt(firstParam(searchParamsResolved.page) ?? "1", 10) || 1,
    );
    const isFiltered = Boolean(search || noticeType || location || status !== "active");
    const browseMode = !isFiltered && page === 1;

    const statuses = [
        { value: "all" as const, label: dict.notices.allStatuses },
        { value: "active" as const, label: dict.notices.statusActive },
        { value: "expiring" as const, label: dict.notices.statusExpiring },
        { value: "expired" as const, label: dict.notices.statusExpired },
    ];

    const [featured, list, types, locations] = await Promise.all([
        getFeaturedNotice(locale),
        getNotices({ search, noticeType, location, status, locale, page }),
        getNoticeTypes(),
        getNoticesLocations(),
    ]);
    const { notices: allNotices, pageCount } = list;
    const notices =
        browseMode && featured
            ? allNotices.filter((notice) => notice.id !== featured.id)
            : allNotices;

    const pages =
        pageCount <= 7
            ? Array.from({ length: pageCount }, (_, i) => i + 1)
            : [...new Set([1, page - 1, page, page + 1, pageCount])]
                .filter((p) => p >= 1 && p <= pageCount)
                .sort((a, b) => a - b);

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <AlertTriangle className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                            {dict.notices.title}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {dict.notices.tagline}
                        </p>
                    </div>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.notices.intro}
                </p>
            </header>

            {browseMode && featured ? (
                <section className="mb-10">
                    <SectionHeader title={dict.notices.featured} />
                    <Link href={featured.href} className="group block">
                        <Card className="overflow-hidden transition-shadow hover:shadow-md">
                            <div className="flex flex-col gap-0 md:flex-row">
                                {featured.imageUrl ? (
                                    <div className="relative h-48 w-full shrink-0 overflow-hidden bg-muted md:h-auto md:w-72">
                                        <span
                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                                            style={{
                                                backgroundImage: `url(${featured.imageUrl})`,
                                            }}
                                            role="img"
                                            aria-label={featured.title}
                                        />
                                    </div>
                                ) : null}
                                <CardContent className="flex flex-1 flex-col justify-center gap-3 py-6">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {featured.noticeType ? (
                                            <Badge variant="secondary">
                                                {NOTICE_TYPE_LABELS[featured.noticeType] ?? featured.noticeType}
                                            </Badge>
                                        ) : null}
                                        {featured.isOfficial ? (
                                            <VerificationBadge status="official_source" />
                                        ) : featured.verification ? (
                                            <VerificationBadge status={featured.verification as "verified" | "community_submission" | "official_source" | "developing"} />
                                        ) : null}
                                    </div>
                                    <h2 className="text-xl font-extrabold leading-snug group-hover:underline md:text-2xl">
                                        {featured.title}
                                    </h2>
                                    {featured.excerpt ? (
                                        <p className="line-clamp-2 text-sm text-muted-foreground">
                                            {featured.excerpt}
                                        </p>
                                    ) : null}
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                        {featured.location ? (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin className="h-3 w-3" aria-hidden />
                                                {featured.location}
                                            </span>
                                        ) : null}
                                        {featured.publishedAt ? (
                                            <span>{dict.notices.posted} {formatDate(featured.publishedAt, locale)}</span>
                                        ) : null}
                                        {featured.expiresAt ? (
                                            <span>{dict.notices.expires} {formatDate(featured.expiresAt, locale)}</span>
                                        ) : null}
                                    </div>
                                </CardContent>
                            </div>
                        </Card>
                    </Link>
                </section>
            ) : null}

            {types.length > 0 ? (
                <nav
                    aria-label={dict.notices.noticeTypes}
                    className="mb-8 flex flex-wrap items-center gap-1.5"
                >
                    <Link
                        href={hrefL({ search, location, status })}
                        aria-current={!noticeType ? "page" : undefined}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${!noticeType
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                            }`}
                    >
                        {dict.notices.allTypes}
                    </Link>
                    {types.map((facet) => (
                        <Link
                            key={facet.type}
                            href={hrefL({ search, location, status, type: facet.type })}
                            aria-current={noticeType === facet.type ? "page" : undefined}
                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${noticeType === facet.type
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                                }`}
                        >
                            {facet.label}
                            <span className="ml-1.5 tabular-nums opacity-70">{facet.total}</span>
                        </Link>
                    ))}
                </nav>
            ) : null}

            <nav
                aria-label={dict.notices.board}
                className="mb-8 flex flex-wrap items-center gap-1.5"
            >
                {statuses.map((s) => (
                    <Link
                        key={s.value}
                        href={hrefL({ search, type: noticeType, location, status: s.value })}
                        aria-current={status === s.value ? "page" : undefined}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${status === s.value
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                            }`}
                    >
                        {s.label}
                    </Link>
                ))}
            </nav>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                    <SectionHeader
                        title={
                            isFiltered ? dict.notices.searchLabel : dict.notices.latest
                        }
                        hint={dict.home.sectionHintNotices}
                    />
                    {notices.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-start gap-3 py-10 text-center sm:items-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <AlertTriangle className="h-6 w-6" aria-hidden />
                                </span>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    {isFiltered
                                        ? dict.notices.empty
                                        : dict.notices.comingSoon}
                                </p>
                                {!isFiltered ? (
                                    <Button render={<Link href={localePath(locale, "/submit")} />}>
                                        {dict.notices.submitCtaButton}
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {notices.map((notice) => (
                                <Link key={notice.id} href={notice.href} className="group block">
                                    <Card className="transition-shadow hover:shadow-md">
                                        <CardContent className="flex gap-4 py-4">
                                            {notice.imageUrl ? (
                                                <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                    <span
                                                        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                                                        style={{
                                                            backgroundImage: `url(${notice.imageUrl})`,
                                                        }}
                                                        role="img"
                                                        aria-label={notice.title}
                                                    />
                                                </div>
                                            ) : null}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    {notice.noticeType ? (
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {NOTICE_TYPE_LABELS[notice.noticeType] ?? notice.noticeType}
                                                        </Badge>
                                                    ) : null}
                                                    {notice.isOfficial ? (
                                                        <VerificationBadge status="official_source" />
                                                    ) : notice.verification ? (
                                                        <VerificationBadge status={notice.verification as "verified" | "community_submission" | "official_source" | "developing"} />
                                                    ) : null}
                                                </div>
                                                <h3 className="text-sm font-bold leading-snug group-hover:underline line-clamp-2">
                                                    {notice.title}
                                                </h3>
                                                {notice.excerpt ? (
                                                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                                        {notice.excerpt}
                                                    </p>
                                                ) : null}
                                                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                                    {notice.location ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <MapPin className="h-3 w-3" aria-hidden />
                                                            {notice.location}
                                                        </span>
                                                    ) : null}
                                                    {notice.publishedAt ? (
                                                        <span>{formatDate(notice.publishedAt, locale)}</span>
                                                    ) : null}
                                                    {notice.expiresAt ? (
                                                        <span className={new Date(notice.expiresAt) < new Date() ? "text-destructive" : ""}>
                                                            {dict.notices.expires} {formatDate(notice.expiresAt, locale)}
                                                        </span>
                                                    ) : null}
                                                    {notice.organizationName ? (
                                                        <span className="font-medium">{notice.organizationName}</span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
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
                                            href={hrefL({
                                                search,
                                                type: noticeType,
                                                location,
                                                status,
                                                page: page - 1,
                                            })}
                                        />
                                    </PaginationItem>
                                ) : null}
                                {pages.map((p) => (
                                    <PaginationItem key={p}>
                                        <PaginationLink
                                            href={hrefL({ search, type: noticeType, location, status, page: p })}
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
                                                type: noticeType,
                                                location,
                                                status,
                                                page: page + 1,
                                            })}
                                        />
                                    </PaginationItem>
                                ) : null}
                            </PaginationContent>
                        </Pagination>
                    ) : null}
                </div>

                <aside className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                                {dict.notices.searchLabel}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                action={localePath(locale, "/notices")}
                                method="GET"
                                role="search"
                                className="space-y-2"
                            >
                                {noticeType ? (
                                    <input type="hidden" name="type" value={noticeType} />
                                ) : null}
                                {location ? (
                                    <input type="hidden" name="location" value={location} />
                                ) : null}
                                {status !== "active" ? (
                                    <input type="hidden" name="status" value={status} />
                                ) : null}
                                <Input
                                    type="search"
                                    name="q"
                                    defaultValue={search ?? ""}
                                    placeholder={dict.notices.searchPlaceholder}
                                    aria-label={dict.notices.searchLabel}
                                />
                                <Button type="submit" className="w-full">
                                    <Search data-icon="inline-start" aria-hidden />
                                    {dict.nav.search}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {locations.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {dict.notices.locations}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="flex flex-wrap gap-1.5">
                                    {locations.map((loc) => (
                                        <li key={loc.slug}>
                                            <Link
                                                href={hrefL({
                                                    search,
                                                    type: noticeType,
                                                    location: loc.slug,
                                                    status,
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
                        <Link href={localePath(locale, "/notices")}>
                            <Button variant="outline" className="w-full">
                                {dict.notices.clearFilters}
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
                                {dict.notices.submitCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.notices.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.notices.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
    ArrowRight,
    CalendarDays,
    Compass,
    MapPin,
    Newspaper,
    Sparkles,
    TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/system/empty-state";
import { localizeType } from "@/lib/admin/labels";
import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/og";
import { SITE } from "@/lib/constants";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { breadcrumbJsonLd, placeJsonLd, renderJsonLd } from "@/lib/seo/jsonld";
import {
    getLocationAncestors,
    getLocationBySlug,
    getLocationContentByHierarchy,
    getLocationDescendants,
    getLocationSlugRedirect,
} from "@/lib/queries/locations";
import { getPhotoPairsForPlace } from "@/lib/queries/photo-pairs";
import { LocationHubMap, type MappedContent } from "@/components/locations/location-map";
import { LocationSubscribeButton } from "@/components/account/location-subscribe-button";
import { ThenNowSlider } from "@/components/locations/then-now-slider";
import Image from "next/image";
import type { Metadata } from "next";

/**
 * Phase 4 — hierarchical location routes.
 *
 * `[...slug]` catches /locations/<place> (single segment, legacy) as well as
 * /locations/<continent>/<country>/<region>/.../<place> (multi-segment,
 * hierarchy-aware). The last segment is always the target location's slug;
 * earlier segments form the breadcrumb path.
 *
 * ISR: prerendered, revalidated every 5 minutes or on demand.
 */
export const revalidate = 300;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
    const { locale: rawLocale, slug: slugParts } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const targetSlug = slugParts[slugParts.length - 1];
    const location = await getLocationBySlug(targetSlug);
    const title = location
        ? `${location.name} — ${dict.nav.locations}`
        : dict.nav.locations;
    const path = "/" + slugParts.join("/");
    return {
        title,
        alternates: buildAlternates(locale, `/locations${path === "/" ? "" : path}`),
        openGraph: {
            title,
            locale: locale === "fr" ? "fr_FR" : "en_GB",
            images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: title }],
        },
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ locale: string; slug: string[] }>;
}) {
    const { locale: rawLocale, slug: slugParts } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const targetSlug = slugParts[slugParts.length - 1];

    const location = await getLocationBySlug(targetSlug);

    if (!location) {
        const replacement = await getLocationSlugRedirect(targetSlug);
        if (replacement) {
            redirect(localePath(locale, `/locations/${replacement}`));
        }
        notFound();
    }

    // Resolve the full hierarchy: ancestors (breadcrumb) + descendants (child places).
    const [ancestors, descendants, content] = await Promise.all([
        getLocationAncestors(targetSlug, locale),
        getLocationDescendants(targetSlug),
        getLocationContentByHierarchy(targetSlug, locale),
    ]);

    // Build breadcrumb: Home > Locations > [ancestor tiers...] > current
    // The last ancestor is the location itself (path includes self).
    const tierAncestors = ancestors.slice(0, -1); // exclude self
    const breadcrumbTrail = [
        { label: dict.nav.home, path: "/" },
        { label: dict.nav.locations, path: "/locations" },
        ...tierAncestors.map((a, i) => ({
            label: a.name,
            path: `/locations/${slugParts.slice(0, i + 1).join("/")}`,
        })),
        { label: location.name },
    ];

    // Phase 4.1 — clustered pins for this hub and its descendants.
    const hubLat = location.latitude != null ? Number(location.latitude) : null;
    const hubLng = location.longitude != null ? Number(location.longitude) : null;
    const hubContent: MappedContent[] =
        hubLat == null || hubLng == null
            ? []
            : content.slice(0, 30).map((item, i) => {
                  const angle = (i * 2.399963) % (Math.PI * 2);
                  const radius = 0.008 * Math.sqrt(i + 1);
                  return {
                      id: item.id,
                      type: item.type,
                      title: item.title,
                      slug: item.id,
                      latitude: hubLat + Math.sin(angle) * radius,
                      longitude: hubLng + Math.cos(angle) * radius,
                      href: item.href,
                      imageUrl: item.imageUrl,
                      publishedAt: item.publishedAt,
                      category: item.category,
                  };
              });

    // Phase 3 — Community Memory: year-by-year archive.
    const byYear = new Map<number, typeof content>();
    for (const item of content) {
        if (!item.publishedAt) continue;
        const year = new Date(item.publishedAt).getFullYear();
        if (!Number.isFinite(year)) continue;
        byYear.set(year, [...(byYear.get(year) ?? []), item]);
    }
    const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);

    // Group content by type for sectioned grid.
    const grouped = {
        news: [] as typeof content,
        photo_story: [] as typeof content,
        notice: [] as typeof content,
        culture: [] as typeof content,
        listing: [] as typeof content,
    } as Record<string, typeof content>;

    for (const item of content) {
        const bucket = grouped[item.type] ?? [];
        bucket.push(item);
    }

    const totalCoverage = content.length;
    const topTypes = Object.entries(grouped)
        .filter(([, items]) => items.length > 0)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 3);

    const featured = content[0];
    const recentCoverage = content.slice(0, 4);

    // Phase 3 — Place + breadcrumb structured data.
    const hubUrl = `${SITE.url}${localePath(locale, `/locations/${slugParts.join("/")}`)}`;
    const jsonLd = renderJsonLd([
        placeJsonLd({
            name: location.name,
            url: hubUrl,
            parentName: location.parentName,
        }),
        breadcrumbJsonLd(breadcrumbTrail.map((b) => ({ name: b.label, url: `${SITE.url}${b.path}` }))),
    ]);

    // Deepest ancestor (tier above current) for the section header badge.
    const parentTier = tierAncestors[tierAncestors.length - 1];

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLd }}
            />
            <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
                <ContentBreadcrumb
                    locale={locale}
                    homeLabel={dict.nav.home}
                    trail={breadcrumbTrail.map((b) => ({ label: b.label, path: b.path }))}
                />

                <header className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] p-6 shadow-sm md:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            {parentTier ? (
                                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                                    <Compass className="h-3.5 w-3.5" aria-hidden />
                                    {parentTier.locationTypeName}
                                </div>
                            ) : null}
                            <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
                                {location.name}
                            </h1>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-primary" aria-hidden />
                                    {location.parentName ? `${location.parentName} · ` : ""}
                                    {totalCoverage > 0 ? "Local coverage" : "No stories yet"}
                                </span>
                                {featured?.publishedAt ? (
                                    <span className="inline-flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                                        Latest update {formatDate(featured.publishedAt, locale)}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-4">
                                <LocationSubscribeButton
                                    locationId={location.id}
                                    locationName={location.name}
                                    copy={dict.account.follows}
                                />
                            </div>
                        </div>

                        <div className="grid w-full max-w-md gap-3 sm:grid-cols-2 lg:w-auto">
                            <StatBlock label={dict.locations.statItems} value={String(totalCoverage)} icon={<Newspaper className="h-4 w-4" />} />
                            <StatBlock label={dict.locations.statTypes} value={String(topTypes.length)} icon={<Sparkles className="h-4 w-4" />} />
                        </div>
                    </div>
                </header>

                {hubLat != null && hubLng != null ? (
                    <section aria-label={dict.locations.onTheMapTitle}>
                        <LocationHubMap
                            hub={{
                                slug: location.slug,
                                name: location.name,
                                latitude: hubLat,
                                longitude: hubLng,
                                href: localePath(locale, `/locations/${slugParts.join("/")}`),
                                depth: location.depth ?? 0,
                            }}
                            content={hubContent}
                            copy={dict.map}
                        />
                    </section>
                ) : null}

                {descendants.length > 0 ? (
                    <section className="space-y-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    {dict.locations.childPlaces.replace("{name}", location.name)}
                                </p>
                                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                                    {dict.locations.browsePlacesIn.replace("{name}", location.name)}
                                </h2>
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                            {descendants.map((child) => (
                                <Link
                                    key={child.slug}
                                    href={localePath(
                                        locale,
                                        `/locations/${slugParts.join("/")}/${child.slug}`,
                                    )}
                                    className="group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-lg font-semibold tracking-tight">{child.name}</h3>
                                            {child.locationTypeName ? (
                                                <span className="mt-1 inline-flex items-center rounded-full border border-border/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                    {child.locationTypeName}
                                                </span>
                                            ) : null}
                                        </div>
                                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <MapPin className="h-4 w-4" aria-hidden />
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                                        <span>
                                            {(child.contentCount ?? 0) > 0
                                                ? `${child.contentCount ?? 0} ${dict.locations.items}`
                                                : dict.locations.awaitingFirst}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}

                {totalCoverage === 0 ? (
                    <EmptyState
                        icon={MapPin}
                        title={dict.locations.emptyTitle}
                        body={dict.locations.emptyBody}
                        actionLabel={dict.locations.browseOtherPlaces}
                        actionHref={localePath(locale, "/locations")}
                    />
                ) : (
                    <>
                        {featured ? (
                            <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                                <Link href={featured.href} className="group block overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
                                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                                        {featured.imageUrl ? (
                                            <Image
                                                src={featured.imageUrl}
                                                alt={featured.title}
                                                fill
                                                sizes="(max-width: 1024px) 100vw, 65vw"
                                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 via-background to-secondary/20 text-2xl font-semibold text-muted-foreground">
                                                {location.name}
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-5">
                                            <Badge variant="secondary" className="mb-3">
                                                {localizeType(featured.type, dict.admin.common)}
                                            </Badge>
                                            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                                {featured.title}
                                            </h2>
                                            <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                                                {featured.category ? <span>{featured.category}</span> : null}
                                                {featured.publishedAt ? (
                                                    <>
                                                        <span>•</span>
                                                        <span>{formatDate(featured.publishedAt, locale)}</span>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </Link>

                                <Card className="overflow-hidden">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                                            Coverage snapshot
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {topTypes.map(([type, items]) => (
                                            <div key={type} className="rounded-2xl border border-border/70 bg-muted/40 p-3">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="font-medium">
                                                        {localizeType(type, dict.admin.common)}
                                                    </span>
                                                    <span className="text-muted-foreground">{items.length}</span>
                                                </div>
                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
                                                        style={{
                                                            width: `${Math.max(18, (items.length / Math.max(totalCoverage, 1)) * 100)}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        <Link href={localePath(locale, "/locations")} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
                                            {dict.locations.browseOtherPlaces}
                                            <ArrowRight className="h-4 w-4" aria-hidden />
                                        </Link>
                                    </CardContent>
                                </Card>
                            </section>
                        ) : null}

                        {recentCoverage.length > 0 ? (
                            <section className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm md:p-6">
                                <div className="mb-5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                        {dict.locations.recentEyebrow}
                                    </p>
                                    <h2 className="mt-2 text-2xl font-bold tracking-tight">
                                        {dict.locations.recentTitle}
                                    </h2>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                    {recentCoverage.map((item) => (
                                        <Link
                                            key={item.id}
                                            href={item.href}
                                            className="group rounded-2xl border border-border/70 bg-muted/30 p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
                                        >
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                                    {localizeType(item.type, dict.admin.common)}
                                                </span>
                                                {item.publishedAt ? (
                                                    <span className="text-xs font-medium text-primary">
                                                        {formatDate(item.publishedAt, locale)}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-sm font-semibold text-foreground group-hover:text-primary">
                                                {item.title}
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {years.length > 0 ? (
                            <section className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm md:p-6">
                                <div className="mb-5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                        {dict.locations.memoryTitle}
                                    </p>
                                    <h2 className="mt-2 text-2xl font-bold tracking-tight">
                                        {dict.locations.memoryTitle}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {dict.locations.memoryHint}
                                    </p>
                                </div>
                                <div className="space-y-6">
                                    {years.map(([year, items]) => (
                                        <div key={year}>
                                            <div className="mb-3 flex items-center gap-3">
                                                <h3 className="text-xl font-extrabold tabular-nums">{year}</h3>
                                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                                                    {items.length}
                                                </span>
                                                <span className="h-px flex-1 bg-border" aria-hidden />
                                            </div>
                                            <ul className="grid gap-2 md:grid-cols-2">
                                                {items.slice(0, 8).map((item) => (
                                                    <li key={item.id}>
                                                        <Link
                                                            href={item.href}
                                                            className="group flex items-baseline justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60"
                                                        >
                                                            <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">
                                                                {item.title}
                                                            </span>
                                                            {item.publishedAt ? (
                                                                <span className="shrink-0 text-xs text-muted-foreground">
                                                                    {formatDate(item.publishedAt, locale)}
                                                                </span>
                                                            ) : null}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        <section className="space-y-6">
                            {Object.entries(grouped)
                                .filter(([, items]) => items.length > 0)
                                .map(([type, items]) => (
                                    <div key={type} className="space-y-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h2 className="text-2xl font-bold tracking-tight">
                                                {localizeType(type, dict.admin.common)}
                                            </h2>
                                            <Badge variant="secondary" className="rounded-full px-3 py-1">
                                                {items.length}
                                            </Badge>
                                        </div>

                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            {items.map((item) => (
                                                <Link
                                                    key={item.id}
                                                    href={item.href}
                                                    className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md"
                                                >
                                                    <div className="relative aspect-[16/10] w-full bg-muted">
                                                        {item.imageUrl ? (
                                                            <Image
                                                                src={item.imageUrl}
                                                                alt={item.title}
                                                                fill
                                                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                                            />
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted via-background to-primary/10 text-sm font-medium text-muted-foreground">
                                                                {localizeType(item.type, dict.admin.common)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="space-y-3 p-4">
                                                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                                            {item.category ? <span>{item.category}</span> : null}
                                                            {item.publishedAt ? (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>{formatDate(item.publishedAt, locale)}</span>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                        <h3 className="text-lg font-semibold leading-snug group-hover:text-primary">
                                                            {item.title}
                                                        </h3>
                                                        <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                                                            Read story
                                                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </section>
                    </>
                )}
            </div>
        </>
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

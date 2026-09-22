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
import { getLocationBySlug, getLocationContent, getLocationSlugRedirect } from "@/lib/queries/locations";
import { getPhotoPairsForPlace } from "@/lib/queries/photo-pairs";
import { LocationHubMap, type MappedContent } from "@/components/locations/location-map";
import { FollowTopicButton } from "@/components/system/follow-topic-button";
import { ThenNowSlider } from "@/components/locations/then-now-slider";
import Image from "next/image";
import type { Metadata } from "next";

/**
 * Phase 1 — ISR. Locale comes from params (no headers()/cookies() read) and
 * the location/content/photo-pair reads are cached under
 * CACHE_TAGS.locations, so hub pages prerender and revalidate on the
 * 5-minute window. The literal is required by the static-analyzability rule
 * for segment config.
 */
export const revalidate = 300;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string; place: string }>;
}): Promise<Metadata> {
    const { locale: rawLocale, place } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const location = await getLocationBySlug(place);
    const title = location
        ? `${location.name} — ${dict.nav.locations}`
        : dict.nav.locations;
    return {
        title,
        alternates: buildAlternates(locale, `/locations/${place}`),
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
    params: Promise<{ locale: string; place: string }>;
}) {
    const { locale: rawLocale, place } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const location = await getLocationBySlug(place);

    if (!location) {
        const replacement = await getLocationSlugRedirect(place);
        if (replacement) redirect(localePath(locale, `/locations/${replacement}`));
        notFound();
    }

    const [content, photoPairs] = await Promise.all([
        getLocationContent(place, locale),
        getPhotoPairsForPlace(place, locale, 4),
    ]);

    // Phase 4.1 — clustered pins for this hub: stories inherit the hub's
    // coordinates with a tiny deterministic jitter so same-place pins
    // spiderfy instead of stacking exactly.
    const hubLat = location.latitude != null ? Number(location.latitude) : null;
    const hubLng = location.longitude != null ? Number(location.longitude) : null;
    const hubContent: MappedContent[] =
        hubLat == null || hubLng == null
            ? []
            : content.slice(0, 30).map((item, i) => {
                  const angle = (i * 2.399963) % (Math.PI * 2); // golden angle
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

    // Phase 4 — Community Memory (Differentiator #10): year-by-year archive
    // driven by published_at, newest year first.
    const byYear = new Map<number, typeof content>();
    for (const item of content) {
        if (!item.publishedAt) continue;
        const year = new Date(item.publishedAt).getFullYear();
        if (!Number.isFinite(year)) continue;
        byYear.set(year, [...(byYear.get(year) ?? []), item]);
    }
    const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);

    const grouped = {
        news: [],
        photo_story: [],
        notice: [],
        culture: [],
        listing: [],
    } as Record<string, typeof content>;

    for (const item of content) {
        const bucket = grouped[item.type] ?? [];
        bucket.push(item);
        grouped[item.type] = bucket;
    }

    // Phase 3 — Place + breadcrumb structured data (rich results).
    const hubUrl = `${SITE.url}${localePath(locale, `/locations/${location.slug}`)}`;
    const jsonLd = renderJsonLd([
        placeJsonLd({
            name: location.name,
            url: hubUrl,
            parentName: location.parentName,
        }),
        breadcrumbJsonLd([
            { name: dict.nav.locations, url: `${SITE.url}${localePath(locale, "/locations")}` },
            { name: location.name, url: hubUrl },
        ]),
    ]);

    const totalCoverage = content.length;
    const topTypes = Object.entries(grouped)
        .filter(([, items]) => items.length > 0)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 3);

    const featured = content[0];
    const recentCoverage = content.slice(0, 4);

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
                trail={[
                    { label: dict.nav.locations, path: "/locations" },
                    { label: location.name },
                ]}
            />
            <header className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                            <Compass className="h-3.5 w-3.5" aria-hidden />
                            Community hub
                        </div>
                        <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
                            {location.name}
                        </h1>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-primary" aria-hidden />
                                {location.parentName ? `${location.parentName} · ` : ""}Local coverage
                            </span>
                            {featured?.publishedAt ? (
                                <span className="inline-flex items-center gap-2">
                                    <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                                    Latest update {formatDate(featured.publishedAt, locale)}
                                </span>
                            ) : null}
                        </div>
                        {/* Phase 3 — place follow (content_follows). */}
                        <div className="mt-4">
                            <FollowTopicButton kind="place" id={location.id} name={location.name} copy={dict.follow} />
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
                            href: localePath(locale, `/locations/${location.slug}`),
                        }}
                        content={hubContent}
                        copy={dict.map}
                    />
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
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">{featured.title}</h2>
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
                                        <span className="font-medium">{localizeType(type, dict.admin.common)}</span>
                                        <span className="text-muted-foreground">{items.length}</span>
                                    </div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
                                            style={{ width: `${Math.max(18, (items.length / Math.max(totalCoverage, 1)) * 100)}%` }}
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
                        <h2 className="mt-2 text-2xl font-bold tracking-tight">{dict.locations.recentTitle}</h2>
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

            {photoPairs.length > 0 ? (
                <section className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm md:p-6">
                    <div className="mb-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            {dict.locations.thenNowTitle}
                        </p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight">{dict.locations.thenNowTitle}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{dict.locations.thenNowHint}</p>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {photoPairs.map((pair) => (
                            <ThenNowSlider
                                key={pair.id}
                                pair={pair}
                                thenLabel={dict.locations.thenLabel}
                                nowLabel={dict.locations.nowLabel}
                            />
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
                        <h2 className="mt-2 text-2xl font-bold tracking-tight">{dict.locations.memoryTitle}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{dict.locations.memoryHint}</p>
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

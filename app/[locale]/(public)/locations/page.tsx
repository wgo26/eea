import Link from "next/link";
import { buildAlternates } from "@/lib/i18n/urls";
import { resolveLocale, getDictionary } from "@/lib/i18n";
import { headers } from "next/headers";
import type { Metadata } from "next";
import {
    ArrowRight,
    Compass,
    MapPin,
    Newspaper,
    TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getLocationsWithCounts } from "@/lib/queries/locations";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.nav.locations,
        alternates: buildAlternates(locale, "/locations"),
    };
}

export default async function Page() {
    const locations = await getLocationsWithCounts();
    const ranked = [...locations].sort(
        (a, b) => (b.contentCount ?? 0) - (a.contentCount ?? 0),
    );

    const featured = ranked.slice(0, 3);
    const totalCoverage = ranked.reduce((sum, item) => sum + (item.contentCount ?? 0), 0);
    const activePlaces = ranked.filter((item) => (item.contentCount ?? 0) > 0).length;
    const mostActive = ranked[0];

    return (
        <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
            <header className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                            <Compass className="h-3.5 w-3.5" aria-hidden />
                            Place-first journalism
                        </div>
                        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                            Every place has a story.
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                            Explore where life is happening across the region — from community news and photo stories to notices, listings, and culture rooted in the places people call home.
                        </p>
                    </div>

                    <div className="grid w-full max-w-md gap-3 sm:grid-cols-3 lg:w-auto">
                        <StatBlock label="Places" value={String(ranked.length)} icon={<MapPin className="h-4 w-4" />} />
                        <StatBlock label="Coverage" value={String(totalCoverage)} icon={<Newspaper className="h-4 w-4" />} />
                        <StatBlock label="Active" value={String(activePlaces)} icon={<TrendingUp className="h-4 w-4" />} />
                    </div>
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                {featured.map((location) => (
                    <Link
                        key={location.slug}
                        href={`/locations/${location.slug}`}
                        className="group block rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                                <MapPin className="h-3 w-3" aria-hidden />
                                Featured place
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">
                                {location.contentCount ?? 0} stories
                            </span>
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">{location.name}</h2>
                        {location.parentName ? (
                            <p className="mt-1 text-sm text-muted-foreground">{location.parentName}</p>
                        ) : null}
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Open location hub</span>
                            <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" aria-hidden />
                        </div>
                    </Link>
                ))}
            </section>

            {mostActive ? (
                <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Most active community
                            </p>
                            <h2 className="mt-2 text-2xl font-bold tracking-tight">{mostActive.name}</h2>
                        </div>
                        <Link
                            href={`/locations/${mostActive.slug}`}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                        >
                            Visit this place hub
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                    </div>
                </section>
            ) : null}

            <section>
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            Browse all places
                        </p>
                        <h2 className="mt-2 text-2xl font-bold tracking-tight">Community map</h2>
                    </div>
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                        {ranked.length} places
                    </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {ranked.map((location) => (
                        <Link
                            key={location.slug}
                            href={`/locations/${location.slug}`}
                            className="group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold tracking-tight">{location.name}</h3>
                                    {location.parentName ? (
                                        <p className="mt-1 text-sm text-muted-foreground">{location.parentName}</p>
                                    ) : null}
                                </div>
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <MapPin className="h-4 w-4" aria-hidden />
                                </span>
                            </div>

                            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                                <span>{location.contentCount ?? 0} items</span>
                                <span className="inline-flex items-center gap-1 font-medium text-primary">
                                    Explore
                                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
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

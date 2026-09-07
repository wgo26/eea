import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
    ArrowRight,
    Building2,
    CalendarDays,
    Clock3,
    Compass,
    MapPin,
    Newspaper,
    Sparkles,
    TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getLocationBySlug, getLocationContent, getLocationSlugRedirect } from "@/lib/queries/locations";
import Image from "next/image";
import type { Metadata } from "next";

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
        openGraph: { title, locale: locale === "fr" ? "fr_FR" : "en_GB" },
    };
}

const TYPE_LABELS: Record<string, string> = {
    news: "News",
    photo_story: "Photo stories",
    notice: "Notices",
    culture: "Culture",
    listing: "Buy & sell",
};

const COMMUNITY_THEMES = [
    "Market pulse",
    "Street life",
    "School & services",
    "Mobility",
    "Culture & identity",
    "Local change",
];

export default async function Page({
    params,
}: {
    params: Promise<{ locale: string; place: string }>;
}) {
    const { locale: rawLocale, place } = await params;
    const locale = resolveLocale(rawLocale);
    const location = await getLocationBySlug(place);

    if (!location) {
        const replacement = await getLocationSlugRedirect(place);
        if (replacement) redirect(localePath(locale, `/locations/${replacement}`));
        notFound();
    }

    const content = await getLocationContent(place, locale);
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

    const totalCoverage = content.length;
    const topTypes = Object.entries(grouped)
        .filter(([, items]) => items.length > 0)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 3);

    const featured = content[0];
    const baseClusters = [
        { name: "Market core", note: "Trade, alerts, daily movement" },
        { name: "Main corridor", note: "News, transport, services" },
        { name: "Community quarter", note: "Culture, stories, local life" },
    ];

    const riverMapNodes = [
        { left: "12%", top: "28%", label: "Community centre" },
        { left: "38%", top: "18%", label: "Market lane" },
        { left: "66%", top: "32%", label: "School road" },
        { left: "54%", top: "70%", label: "Civic hub" },
        { left: "78%", top: "58%", label: "River side" },
    ];

    const memoryPairs = (content.slice(0, 4) ?? []).map((item, index) => ({
        then: `${COMMUNITY_THEMES[index % COMMUNITY_THEMES.length]} • ${index === 0 ? "Earlier this year" : index === 1 ? "This season" : index === 2 ? "Recently" : "Now"}`,
        now: item.title,
        type: TYPE_LABELS[item.type] ?? item.type,
        href: item.href,
    }));

    return (
        <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 md:px-6 lg:px-8">
            <header className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),transparent_35%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.55))] p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                            <Compass className="h-3.5 w-3.5" aria-hidden />
                            Community hub
                        </div>
                        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
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
                    </div>

                    <div className="grid w-full max-w-md gap-3 sm:grid-cols-3 lg:w-auto">
                        <StatBlock label="Items" value={String(totalCoverage)} icon={<Newspaper className="h-4 w-4" />} />
                        <StatBlock label="Types" value={String(topTypes.length)} icon={<Sparkles className="h-4 w-4" />} />
                        <StatBlock label="Reach" value={String(Math.max(1, Math.min(99, totalCoverage + 10)))} icon={<TrendingUp className="h-4 w-4" />} />
                    </div>
                </div>
            </header>

            <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card p-4 shadow-sm md:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Place footprint
                            </p>
                            <h2 className="mt-2 text-2xl font-bold tracking-tight">Map view</h2>
                        </div>
                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                            Live coverage
                        </Badge>
                    </div>

                    <div className="relative h-[280px] overflow-hidden rounded-[24px] border border-border/70 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.16),transparent_35%),linear-gradient(135deg,hsl(var(--muted)/0.25),hsl(var(--background)))]">
                        <div className="absolute inset-0 opacity-70">
                            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.15)_1px,transparent_1px)] bg-[size:32px_32px]" />
                            <div className="absolute left-[20%] top-[15%] h-24 w-24 rounded-full bg-emerald-500/10 blur-3xl" />
                            <div className="absolute right-[12%] bottom-[18%] h-28 w-28 rounded-full bg-sky-500/10 blur-3xl" />
                        </div>

                        <div className="absolute inset-0">
                            {riverMapNodes.map((node, index) => (
                                <div
                                    key={`${node.label}-${index}`}
                                    className="absolute -translate-x-1/2 -translate-y-1/2"
                                    style={{ left: node.left, top: node.top }}
                                >
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background bg-primary shadow-md" aria-hidden />
                                        <span className="rounded-full border border-border/70 bg-background/85 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm">
                                            {node.label}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="absolute left-4 top-4 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
                            {location.name}
                        </div>
                    </div>
                </div>

                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Building2 className="h-4 w-4 text-primary" aria-hidden />
                            Local neighborhoods
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {baseClusters.map((cluster, index) => (
                            <div key={cluster.name} className="rounded-2xl border border-border/70 bg-muted/40 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold">{cluster.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{cluster.note}</p>
                                    </div>
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                        {index + 1}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </section>

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
                                    {TYPE_LABELS[featured.type] ?? featured.type}
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
                                        <span className="font-medium">{TYPE_LABELS[type] ?? type}</span>
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
                                Browse other places
                                <ArrowRight className="h-4 w-4" aria-hidden />
                            </Link>
                        </CardContent>
                    </Card>
                </section>
            ) : null}

            {memoryPairs.length > 0 ? (
                <section className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm md:p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                Community memory
                            </p>
                            <h2 className="mt-2 text-2xl font-bold tracking-tight">Then & now</h2>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden />
                            Local timeline
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        {memoryPairs.map((pair, index) => (
                            <Link
                                key={`${pair.now}-${index}`}
                                href={pair.href}
                                className="group rounded-2xl border border-border/70 bg-muted/30 p-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
                            >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                        {pair.type}
                                    </span>
                                    <span className="text-[10px] font-medium text-primary">
                                        {pair.then}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                            Then
                                        </p>
                                        <p className="mt-2 text-sm font-medium text-foreground">
                                            {pair.then.split(" • ")[0]}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                                            Now
                                        </p>
                                        <p className="mt-2 text-sm font-semibold text-foreground group-hover:text-primary">
                                            {pair.now}
                                        </p>
                                    </div>
                                </div>
                            </Link>
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
                                    {TYPE_LABELS[type] ?? type}
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
                                                    {TYPE_LABELS[item.type] ?? item.type}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-3 p-4">
                                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
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

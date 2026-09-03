import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { CalendarDays, Clock, Landmark, MapPin } from "lucide-react";

import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getUpcomingEvents } from "@/lib/queries/culture";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return {
        title: "Events",
        description:
        "Community event calendar — what's on, where and when across Africa.",
        alternates: buildAlternates(locale, "/culture/events"),
    };
}

type EventsSearchParams = {
    location?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function EventsPage({
    searchParams,
}: {
    searchParams: Promise<EventsSearchParams>;
}) {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const params = await searchParams;
    const location = firstParam(params.location)?.trim() || undefined;

    const allEvents = await getUpcomingEvents(locale, 50);

    const filtered = location
        ? allEvents.filter(
            (e) => e.locationSlug === location || e.location?.toLowerCase() === location.toLowerCase(),
        )
        : allEvents;

    const locations = [
        ...new Map(
            allEvents
                .filter((e) => e.location)
                .map((e) => [e.location!, e.locationSlug ?? e.location!]),
        ).entries(),
    ].map(([name, slug]) => ({ name, slug }));

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            {/* Header */}
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <CalendarDays className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                            {dict.culture.events}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {dict.culture.upcomingEvents}
                        </p>
                    </div>
                </div>
            </header>

            {/* Location filter */}
            {locations.length > 0 ? (
                <nav
                    aria-label={dict.culture.locations}
                    className="mb-8 flex flex-wrap items-center gap-1.5"
                >
                    <Link
                        href={localePath(locale, "/culture/events")}
                        aria-current={!location ? "page" : undefined}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                            !location
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                    >
                        {dict.culture.allLocations}
                    </Link>
                    {locations.map((loc) => (
                        <Link
                            key={loc.slug}
                            href={localePath(locale, `/culture/events?location=${encodeURIComponent(loc.slug)}`)}
                            aria-current={location === loc.slug ? "page" : undefined}
                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                                location === loc.slug
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                            }`}
                        >
                            {loc.name}
                        </Link>
                    ))}
                </nav>
            ) : null}

            {/* Events grid */}
            {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-12 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
                        <CalendarDays className="h-6 w-6" aria-hidden />
                    </span>
                    <p className="mt-4 text-sm text-muted-foreground">
                        {dict.culture.noEvents}
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((event) => (
                        <Link
                            key={event.id}
                            href={event.href}
                            className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
                        >
                            {event.imageUrl ? (
                                <div
                                    className="aspect-[16/9] bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                                    style={{ backgroundImage: `url(${event.imageUrl})` }}
                                    role="img"
                                    aria-label={event.title}
                                />
                            ) : (
                                <div className="aspect-[16/9] bg-muted flex items-center justify-center">
                                    <CalendarDays className="h-10 w-10 text-muted-foreground/30" aria-hidden />
                                </div>
                            )}
                            <div className="flex flex-1 flex-col p-4">
                                {/* Date strip */}
                                {event.eventDate ? (
                                    <div className="mb-2 flex items-center gap-2 text-xs font-bold text-primary">
                                        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                                        <time dateTime={event.eventDate}>
                                            {new Date(event.eventDate).toLocaleDateString(undefined, {
                                                weekday: "short",
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })}
                                        </time>
                                    </div>
                                ) : null}
                                <h2 className="line-clamp-2 text-base font-bold leading-snug tracking-tight group-hover:underline">
                                    {event.title}
                                </h2>
                                {event.excerpt ? (
                                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                                        {event.excerpt}
                                    </p>
                                ) : null}
                                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted-foreground">
                                    {event.eventTime ? (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="h-3 w-3" aria-hidden />
                                            {event.eventTime}
                                        </span>
                                    ) : null}
                                    {event.venue ? (
                                        <span className="inline-flex items-center gap-1">
                                            <Landmark className="h-3 w-3" aria-hidden />
                                            {event.venue}
                                        </span>
                                    ) : null}
                                    {event.location ? (
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin className="h-3 w-3" aria-hidden />
                                            {event.location}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

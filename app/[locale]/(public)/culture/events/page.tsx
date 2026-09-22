import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { buildAlternates, localePath } from "@/lib/i18n/urls";

import { EventsCalendar } from "@/components/events/events-calendar";
import { EventsViewToggle } from "@/components/events/events-view-toggle";
import { EventCard } from "@/components/culture/event-card";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getUpcomingEvents } from "@/lib/queries/culture";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return {
        title: dict.culture.upcomingEvents,
        description:
            locale === "fr"
                ? "Agenda communautaire — sorties, lieux et dates en Afrique."
                : "Community event calendar — what's on, where and when across Africa.",
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
    params: routeParams,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<EventsSearchParams>;
}) {
    const { locale: rawLocale } = await routeParams;
    const locale = resolveLocale(rawLocale);
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
                <EventsViewToggle
                    listLabel={dict.culture.listView}
                    calendarLabel={dict.culture.calendarView}
                    calendar={<EventsCalendar events={filtered} locale={locale} />}
                >
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((event) => (
                        <EventCard key={event.id} event={event} dict={dict} locale={locale} />
                    ))}
                </div>
                </EventsViewToggle>
            )}
        </div>
    );
}

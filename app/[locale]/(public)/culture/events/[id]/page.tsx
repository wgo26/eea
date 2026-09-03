import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, CalendarDays, Clock, Landmark, MapPin, Tag, User } from "lucide-react";

import { ShareButtons } from "@/components/share-buttons";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getEventById } from "@/lib/queries/culture";

type Props = {
    params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    const locale = resolveLocale((await headers()).get("x-locale"));
    const event = await getEventById(id, locale);
    if (!event) return { title: "Event" };
    return {
        title: event.title,
        description: event.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/culture/events/${event.slug}`),
    };
}

export default async function EventDetailPage({ params }: Props) {
    const { id } = await params;
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const event = await getEventById(id, locale);
    if (!event) notFound();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://eagleeyeafrica.com";
    const shareUrl = `${siteUrl}/culture/events/${event.slug}`;

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            {/* Back link */}
            <Link
                href={localePath(locale, "/culture/events")}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.culture.events}
            </Link>

            <article>
                {/* Event header */}
                <header className="mb-8">
                    {event.category ? (
                        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            {event.category}
                        </span>
                    ) : null}
                    <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">
                        {event.title}
                    </h1>
                    {event.excerpt ? (
                        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                            {event.excerpt}
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        {event.location ? (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" aria-hidden />
                                {event.location}
                            </span>
                        ) : null}
                        {event.publishedAt ? (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4" aria-hidden />
                                {new Date(event.publishedAt).toLocaleDateString()}
                            </span>
                        ) : null}
                    </div>
                </header>

                {/* Featured image */}
                {event.imageUrl ? (
                    <div className="relative mb-8 overflow-hidden rounded-3xl bg-muted">
                        <div
                            className="aspect-[16/9] bg-cover bg-center"
                            style={{ backgroundImage: `url(${event.imageUrl})` }}
                            role="img"
                            aria-label={event.title}
                        />
                    </div>
                ) : null}

                {/* Event info card */}
                <section className="mb-8 rounded-2xl border bg-card p-6">
                    <h2 className="mb-4 text-lg font-extrabold">{dict.culture.eventDetails}</h2>
                    <dl className="grid gap-4 sm:grid-cols-2">
                        {event.eventDate ? (
                            <div className="flex items-start gap-3">
                                <dt>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <CalendarDays className="h-4 w-4" aria-hidden />
                                    </span>
                                </dt>
                                <dd>
                                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        {dict.culture.eventDate}
                                    </span>
                                    <span className="mt-0.5 block text-sm font-semibold">
                                        {new Date(event.eventDate).toLocaleDateString(undefined, {
                                            weekday: "long",
                                            year: "numeric",
                                            month: "long",
                                            day: "numeric",
                                        })}
                                    </span>
                                </dd>
                            </div>
                        ) : null}
                        {event.eventTime ? (
                            <div className="flex items-start gap-3">
                                <dt>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Clock className="h-4 w-4" aria-hidden />
                                    </span>
                                </dt>
                                <dd>
                                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        {dict.culture.eventTime}
                                    </span>
                                    <span className="mt-0.5 block text-sm font-semibold">
                                        {event.eventTime}
                                    </span>
                                </dd>
                            </div>
                        ) : null}
                        {event.venue ? (
                            <div className="flex items-start gap-3">
                                <dt>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Landmark className="h-4 w-4" aria-hidden />
                                    </span>
                                </dt>
                                <dd>
                                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        {dict.culture.venue}
                                    </span>
                                    <span className="mt-0.5 block text-sm font-semibold">
                                        {event.venue}
                                    </span>
                                </dd>
                            </div>
                        ) : null}
                        {event.organizer ? (
                            <div className="flex items-start gap-3">
                                <dt>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <User className="h-4 w-4" aria-hidden />
                                    </span>
                                </dt>
                                <dd>
                                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        {dict.culture.organizer}
                                    </span>
                                    <span className="mt-0.5 block text-sm font-semibold">
                                        {event.organizer}
                                    </span>
                                </dd>
                            </div>
                        ) : null}
                        {event.ticketInfo ? (
                            <div className="flex items-start gap-3 sm:col-span-2">
                                <dt>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Tag className="h-4 w-4" aria-hidden />
                                    </span>
                                </dt>
                                <dd>
                                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        {dict.culture.ticketInfo}
                                    </span>
                                    <span className="mt-0.5 block text-sm font-semibold">
                                        {event.ticketInfo}
                                    </span>
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </section>

                {/* Event description / body */}
                {event.body ? (
                    <div
                        className="prose prose-neutral dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: event.body }}
                    />
                ) : null}

                {/* Share */}
                <div className="mt-8 border-t pt-6">
                    <p className="mb-3 text-sm font-bold">{dict.culture.shareEvent}</p>
                    <ShareButtons url={shareUrl} title={event.title} />
                </div>
            </article>
        </div>
    );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Landmark, MapPin, Tag, User } from "lucide-react";

import { ShareButtons } from "@/components/share-buttons";
import { ContentSocialProof } from "@/components/system/content-social-proof";
import { ContentViewBeacon } from "@/components/system/content-view-beacon";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { SmartImage } from "@/components/media/smart-image";
import { breadcrumbJsonLd, eventJsonLd, renderJsonLd } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/constants";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getEventById } from "@/lib/queries/culture";
import { sanitizeBodyHtml } from "@/lib/security/html";
import { getBroadcastForEvent } from "@/lib/live/queries";
import { canBroadcast, getRsvpState, isNativeLiveEnabled } from "@/lib/live/actions";
import { assertCapability } from "@/lib/admin/auth";
import { getSessionUser } from "@/lib/auth/guards";
import { LiveBadge } from "@/components/live/live-badge";
import { LivePlayer } from "@/components/live/live-player";
import { LiveChat } from "@/components/live/live-chat";
import { RsvpButton } from "@/components/live/rsvp-button";
import { BroadcastControls } from "@/components/live/broadcast-controls";
import { ReminderButton } from "@/components/events/reminder-button";
import { PlaceRail } from "@/components/place/place-rail";

type Props = {
    params: Promise<{ id: string; locale: string }>;
};

/**
 * A3 — ISR: editorial content, revalidated every 5 minutes (or on demand).
 * The literal is required: segment config must be statically analyzable.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id, locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const event = await getEventById(id, locale);
    if (!event) return { title: locale === "fr" ? "Événement introuvable" : "Event not found" };
    return {
        title: event.title,
        description: event.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/culture/events/${event.slug}`),
    };
}

export default async function EventDetailPage({ params }: Props) {
    const { id, locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    const event = await getEventById(id, locale);
    if (!event) notFound();

    // Community live layer: the broadcast (if any), RSVP headcount + the
    // viewer's own RSVP, and the staff-only desk for `broadcast.live` holders.
    const [broadcast, rsvp, staff, moderator, session, nativeEnabled] = await Promise.all([
        getBroadcastForEvent(event.id),
        getRsvpState(event.id).catch(() => ({ going: false, count: 0 })),
        canBroadcast(),
        assertCapability("moderate").then(() => true).catch(() => false),
        getSessionUser().then((s) => Boolean(s.user)).catch(() => false),
        isNativeLiveEnabled(),
    ]);

    // Render-boundary sanitization — defense in depth over the ingestion-side
    // sanitizer. Untrusted DB HTML must never reach dangerouslySetInnerHTML.
    const bodyHtml = sanitizeBodyHtml(event.body);

    const shareUrl = `${SITE.url}${localePath(locale, `/culture/events/${event.slug}`)}`;
    // Phase 3 — Event + breadcrumb structured data (rich results).
    const jsonLd = renderJsonLd([
        eventJsonLd({
            name: event.title,
            description: event.excerpt,
            image: event.imageUrl,
            url: shareUrl,
            startDate: event.eventDate,
            endDate: event.eventTime,
            venue: event.venue,
            locationName: event.location,
            organizerName: event.organizer,
        }),
        breadcrumbJsonLd([
            { name: dict.nav.culture, url: `${SITE.url}${localePath(locale, "/culture")}` },
            { name: dict.culture.events, url: `${SITE.url}${localePath(locale, "/culture/events")}` },
            { name: event.title, url: shareUrl },
        ]),
    ]);

    return (
        <>
        <ContentViewBeacon contentId={event.id} />
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[
                    { label: dict.nav.culture, path: "/culture" },
                    { label: dict.culture.events, path: "/culture/events" },
                    { label: event.title },
                ]}
            />

            <article>
                {/* Event header */}
                <header className="mb-8">
                    <span className="flex flex-wrap items-center gap-1.5">
                        {event.category ? (
                            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                {event.category}
                            </span>
                        ) : null}
                        <LiveBadge
                            status={broadcast?.status ?? null}
                            liveLabel={dict.culture.liveBadge}
                            soonLabel={dict.culture.liveSoon}
                            endedLabel={dict.culture.liveEnded}
                        />
                    </span>
                    <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">
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
                                {new Date(event.publishedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB")}
                            </span>
                        ) : null}
                    </div>
                </header>

                {/* Featured image */}
                {event.imageUrl ? (
                    <div className="relative mb-8 overflow-hidden rounded-3xl bg-muted">
                        <span className="relative block aspect-[16/9] w-full overflow-hidden">
                            <SmartImage
                                src={event.imageUrl}
                                alt={event.title}
                                sizes="(max-width: 1024px) 100vw, 832px"
                                priority
                                className="object-cover"
                            />
                        </span>
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
                                        {new Date(event.eventDate).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
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

                {/* Community live: player while live, recording after the end. */}
                {broadcast?.status === "live" ? (
                    <section aria-label={dict.culture.watchLive} className="mb-8 grid gap-4">
                        <LivePlayer
                            broadcast={broadcast}
                            title={event.title}
                            nativeOffLabel={dict.culture.broadcastNativeOff}
                        />
                        <LiveChat
                            broadcastId={broadcast.id}
                            contentItemId={event.id}
                            isLive
                            signedIn={session}
                            canModerate={moderator}
                            copy={{
                                title: dict.culture.liveChat,
                                hint: dict.culture.liveChatHint,
                                placeholder: dict.culture.chatPlaceholder,
                                send: dict.culture.chatSend,
                                signIn: dict.culture.chatSignIn,
                                closed: dict.culture.chatClosed,
                                empty: dict.culture.chatEmpty,
                                hiddenNote: dict.culture.chatHidden,
                                report: dict.culture.chatReport,
                                reported: dict.culture.chatReported,
                            }}
                        />
                    </section>
                ) : null}
                {broadcast?.status === "ended" && broadcast.recordingUrl ? (
                    <section aria-label={dict.culture.watchRecording} className="mb-8">
                        <video
                            src={broadcast.recordingUrl}
                            controls
                            preload="none"
                            playsInline
                            className="aspect-video w-full overflow-hidden rounded-2xl border bg-black"
                        />
                    </section>
                ) : null}
                {broadcast?.recapHref ? (
                    <p className="mb-8">
                        <a
                            href={localePath(locale, broadcast.recapHref)}
                            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary hover:bg-primary/15"
                        >
                            {dict.culture.viewRecap}
                            {broadcast.recapTitle ? ` — ${broadcast.recapTitle}` : ""}
                        </a>
                    </p>
                ) : null}

                {/* More culture from the reader's place (town-square bridge). */}
                <div className="mb-8">
                    <PlaceRail locale={locale} dict={dict} kind="culture" sectionPath="/culture" />
                </div>

                {/* RSVP + reminder */}
                <div className="mb-8 flex flex-wrap items-center gap-3">
                    <RsvpButton
                        contentItemId={event.id}
                        initialGoing={rsvp.going}
                        initialCount={rsvp.count}
                        signedIn={session}
                        copy={{
                            going: dict.culture.rsvpGoing,
                            cancel: dict.culture.rsvpCancel,
                            count: dict.culture.rsvpCount,
                            signIn: dict.culture.rsvpSignIn,
                        }}
                    />
                    {event.eventDate ? (
                        <ReminderButton
                            contentItemId={event.id}
                            eventStartsAt={event.eventDate}
                            copy={dict.reminders}
                        />
                    ) : null}
                </div>

                {/* Event description / body */}
                {bodyHtml ? (
                    <div
                        className="prose prose-neutral dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                ) : null}

                {/* Share */}
                <div className="mt-8 border-t pt-6">
                    <p className="mb-3 text-sm font-bold">{dict.culture.shareEvent}</p>
                    {event.viewCount || event.shareCount ? (
                        <p className="mb-3 text-sm text-muted-foreground">
                            <ContentSocialProof
                                viewCount={event.viewCount}
                                shareCount={event.shareCount}
                                viewsLabel={dict.culture.views}
                                sharesLabel={dict.news.shares}
                                locale={locale}
                            />
                        </p>
                    ) : null}
                    <ShareButtons
                        url={shareUrl}
                        title={event.title}
                        locale={locale}
                        contentId={event.id}
                        labels={{
                            share: dict.common.share,
                            whatsapp: dict.common.whatsapp,
                            copyLink: dict.common.copyLink,
                            copied: dict.common.copied,
                        }}
                    />
                </div>

                {/* Staff broadcast desk — `broadcast.live` holders only; the
                    actions re-check the capability, so this is convenience,
                    not the wall. */}
                {staff ? (
                    <div className="mt-8">
                        <BroadcastControls
                            contentItemId={event.id}
                            slugOrId={event.slug}
                            broadcast={broadcast}
                            nativeEnabled={nativeEnabled}
                            copy={{
                                title: dict.culture.broadcastTitle,
                                provider: dict.culture.broadcastProvider,
                                url: dict.culture.broadcastUrl,
                                urlHint: dict.culture.broadcastUrlHint,
                                save: dict.culture.broadcastSave,
                                goLive: dict.culture.broadcastGoLive,
                                end: dict.culture.broadcastEnd,
                                recording: dict.culture.broadcastRecording,
                                recap: dict.culture.broadcastRecap,
                                saved: dict.culture.broadcastSaved,
                                live: dict.culture.broadcastLive,
                                ended: dict.culture.broadcastEnded,
                                confirmEnd: dict.culture.broadcastConfirmEnd,
                                nativeOff: dict.culture.broadcastNativeOff,
                            }}
                        />
                    </div>
                ) : null}
            </article>
        </div>
        </>
    );
}

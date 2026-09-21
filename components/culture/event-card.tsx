import { CalendarDays, Clock, Landmark, MapPin } from "lucide-react";
import { CARD_SIZES, SmartImage } from "@/components/media/smart-image";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { EventData } from "@/lib/queries/culture";
import {
    CardBadgeRow,
    CardCover,
    CardMeta,
    CardMetaItem,
    CardShell,
    CardTitle,
} from "@/components/home/card-parts";

/**
 * Phase 3 — EventCard extracted from the inline culture/events markup so
 * events share the standard card anatomy (shell → cover → badge row →
 * title → excerpt → meta) with StoryCard/ListingCard/NoticeCard/SearchResult.
 */
export function EventCard({
    event,
    dict,
    locale,
}: {
    event: EventData;
    dict: Dictionary;
    locale: Locale;
}) {
    return (
        <CardShell href={event.href} className="flex flex-col">
            {event.imageUrl ? (
                <CardCover aspect="aspect-[16/9]">
                    <SmartImage
                        src={event.imageUrl}
                        alt={event.title}
                        sizes={CARD_SIZES}
                        className="object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.03]"
                    />
                </CardCover>
            ) : (
                <div className="flex aspect-[16/9] items-center justify-center bg-muted" aria-hidden>
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
                <CardBadgeRow
                    category={event.category}
                    verification={event.verification}
                    dict={dict}
                    locale={locale}
                />
                <CardTitle className="mt-2">{event.title}</CardTitle>
                {event.excerpt ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                        {event.excerpt}
                    </p>
                ) : null}
                <CardMeta className="mt-auto pt-3">
                    {event.eventTime ? (
                        <CardMetaItem icon={Clock}>{event.eventTime}</CardMetaItem>
                    ) : null}
                    {event.venue ? (
                        <CardMetaItem icon={Landmark}>{event.venue}</CardMetaItem>
                    ) : null}
                    {event.location ? (
                        <CardMetaItem icon={MapPin}>{event.location}</CardMetaItem>
                    ) : null}
                </CardMeta>
            </div>
        </CardShell>
    );
}

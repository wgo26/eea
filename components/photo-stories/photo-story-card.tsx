import Link from "next/link";
import { Eye, Images, MapPin } from "lucide-react";

import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import type { PhotoStoryData } from "@/lib/queries/photo-stories";
import { cn } from "@/lib/utils";

type PhotoStoryCardProps = {
    story: PhotoStoryData;
    dict: Dictionary;
    locale: Locale;
    className?: string;
};

/**
 * Photo-magazine grid card: a taller cover with a photo-count chip, the
 * verification badge, category and an editorial meta row. Dedicated to the
 * Photo Stories grid so the count + imagery can breathe without touching
 * the shared StoryCard used by the other verticals.
 */
export function PhotoStoryCard({
    story,
    dict,
    locale,
    className,
}: PhotoStoryCardProps) {
    const badge = verificationBadgeInfo(story.verification ?? null, dict);

    return (
        <Link
            href={story.href}
            className={cn(
                "group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md",
                className,
            )}
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {story.imageUrl ? (
                    <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                        style={{ backgroundImage: `url(${story.imageUrl})` }}
                        role="img"
                        aria-label={story.title}
                    />
                ) : (
                    <div className="absolute inset-0 bg-muted" aria-hidden />
                )}
                <span
                    className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10"
                    aria-hidden
                />
                {badge ? (
                    <span
                        className={cn(
                            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm",
                            badge.className,
                        )}
                    >
                        {badge.label}
                    </span>
                ) : null}
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                    <Images className="h-3 w-3" aria-hidden />
                    {story.photos.length} {dict.photoStories.photosLabel}
                </span>
            </div>
            <div className="flex flex-1 flex-col p-4">
                {story.category ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-link">
                        {story.category}
                    </span>
                ) : null}
                <h3 className="mt-1.5 line-clamp-2 text-base font-bold leading-snug tracking-tight group-hover:underline">
                    {story.title}
                </h3>
                {story.excerpt ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                        {story.excerpt}
                    </p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-3 text-xs text-muted-foreground">
                    {story.location ? (
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden />
                            {story.location}
                        </span>
                    ) : null}
                    {story.publishedAt ? (
                        <span>{formatDate(story.publishedAt, locale)}</span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" aria-hidden />
                        {story.viewCount ?? 0}
                    </span>
                </div>
            </div>
        </Link>
    );
}
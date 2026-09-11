import Link from "next/link";
import { ArrowRight, Camera, Clock, MapPin } from "lucide-react";
import { formatDate, timeAgo, type Dictionary, type Locale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import type { StoryCardData } from "@/lib/queries/home";
import { MediaBadge } from "@/components/media/media-attachment";
import { SmartImage } from "@/components/media/smart-image";
import { cn } from "@/lib/utils";

type StoryCardProps = {
  story: StoryCardData;
  dict: Dictionary;
  locale: Locale;
  /** "grid" = image-top card; "row" = horizontal compact card. */
  variant?: "grid" | "row";
  className?: string;
};

/**
 * Editorial story card (spec §1A): image, headline, category, date,
 * location where relevant, plus the trust-layer verification badge.
 */
export function StoryCard({
  story,
  dict,
  locale,
  variant = "grid",
  className,
}: StoryCardProps) {
  const badge = verificationBadgeInfo(story.verification ?? null, dict);

  if (variant === "row") {
    return (
      <Link
        href={story.href}
        className={cn(
          "group flex gap-3 rounded-2xl border bg-card p-2 transition-shadow hover:shadow-md",
          className
        )}
      >
      <div
        className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-muted"
      >
        {story.imageUrl ? (
          <SmartImage
            src={story.imageUrl}
            alt={story.title}
            fill={false}
            width={112}
            height={80}
            sizes="112px"
            className="h-20 w-28 object-cover"
          />
        ) : null}
      </div>
        <div className="min-w-0 flex-1 py-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {story.category ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {story.category}
              </span>
            ) : null}
            {badge ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  badge.className
                )}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
            {story.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {story.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {story.location}
              </span>
            ) : null}
            {story.publishedAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {timeAgo(story.publishedAt, locale)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={story.href}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md",
        className
      )}
    >
      <div
        className="relative aspect-[16/10] w-full overflow-hidden bg-muted"
      >
        {story.imageUrl ? (
          <SmartImage
            src={story.imageUrl}
            alt={story.title}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
        {badge ? (
          <span
            className={cn(
              "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm",
              badge.className
            )}
          >
            {badge.label}
          </span>
        ) : null}
        {(story.hasVideo || story.hasAudio) && (
          <span className="absolute bottom-2 left-2 flex gap-1.5">
            {story.hasVideo ? <MediaBadge kind="video" /> : null}
            {story.hasAudio ? <MediaBadge kind="audio" /> : null}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {story.category ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {story.category}
            </span>
          ) : null}
          {story.credit ? (
            <span className="text-[10px] font-medium text-muted-foreground">
              {dict.home.photographBy} {story.credit}
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug tracking-tight group-hover:underline">
          {story.title}
        </h3>
        {story.excerpt ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{story.excerpt}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-3 text-xs text-muted-foreground">
          {story.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {story.location}
            </span>
          ) : null}
          {story.publishedAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {formatDate(story.publishedAt, locale)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Empty-state tile shown when a section has no published content yet. */
export function EmptySection({ dict, href, label }: { dict: Dictionary; href: string; label: string }) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-dashed p-6 sm:flex-row sm:items-center">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Camera className="h-4 w-4" aria-hidden />
        {dict.common.comingSoon}
      </p>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
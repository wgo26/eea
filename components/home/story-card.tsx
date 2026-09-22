import Link from "next/link";
import { ArrowRight, Camera, Clock, MapPin, UserRound } from "lucide-react";
import { formatDate, timeAgo, type Dictionary, type Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";
import { MediaBadge } from "@/components/media/media-attachment";
import { SmartImage } from "@/components/media/smart-image";
import { SaveButton } from "@/components/system/save-button";
import {
    CardBadgeRow,
    CardCover,
    CardMeta,
    CardMetaItem,
    CardShell,
    CardTitle,
} from "@/components/home/card-parts";
import { TrustBadge } from "@/components/system/trust-badge";
import { cn } from "@/lib/utils";

type StoryCardProps = {
  story: StoryCardData;
  dict: Dictionary;
  locale: Locale;
  /** "grid" = image-top card; "row" = horizontal compact card. */
  variant?: "grid" | "row";
  className?: string;
  /** Card extras provided by NewsArticle (author credit + reading time). */
  author?: string | null;
  readingMinutes?: number | null;
  /** Show the save-for-later toggle (overlay, outside the card link). */
  showSave?: boolean;
};

function saveLabels(dict: Dictionary) {
  return {
    save: dict.common.saveForLater,
    unsave: dict.common.removeSaved,
    savedMessage: dict.common.savedToList,
    removedMessage: dict.common.removedFromList,
    signIn: dict.common.signInToSave,
  };
}

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
  author = null,
  readingMinutes = null,
  showSave = true,
}: StoryCardProps) {
  if (variant === "row") {
    return (
      <div className={cn("relative", className)}>
      <CardShell
        href={story.href}
        className="flex gap-3 p-2"
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
          <CardBadgeRow
            category={story.category}
            verification={story.verification}
            dict={dict}
            locale={locale}
          />
          <CardTitle size="sm" className="mt-1 font-semibold">
            {story.title}
          </CardTitle>
          <CardMeta className="mt-1">
            {story.location ? (
              <CardMetaItem icon={MapPin}>{story.location}</CardMetaItem>
            ) : null}
            {story.publishedAt ? (
              <CardMetaItem icon={Clock}>{timeAgo(story.publishedAt, locale)}</CardMetaItem>
            ) : null}
          </CardMeta>
        </div>
      </CardShell>
      {showSave ? (
        <SaveButton
          contentItemId={story.id}
          labels={saveLabels(dict)}
          className="absolute right-2 top-2"
        />
      ) : null}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
    <CardShell
      href={story.href}
      className="flex flex-col"
    >
      <CardCover aspect="aspect-[16/10]">
        {story.imageUrl ? (
          <SmartImage
            src={story.imageUrl}
            alt={story.title}
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 ease-standard group-hover:scale-[1.02]"
          />
        ) : null}
        <TrustBadge
          verification={story.verification}
          dict={dict}
          locale={locale}
          link={false}
          className="absolute left-2 top-2"
        />
        {(story.hasVideo || story.hasAudio) && (
          <span className="absolute bottom-2 left-2 flex gap-1.5">
            {story.hasVideo ? <MediaBadge kind="video" /> : null}
            {story.hasAudio ? <MediaBadge kind="audio" /> : null}
          </span>
        )}
      </CardCover>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <CardBadgeRow
            category={story.category}
            verification={null}
            dict={dict}
            locale={locale}
          />
          {story.credit ? (
            <span className="text-xs font-medium text-muted-foreground">
              {dict.home.photographBy} {story.credit}
            </span>
          ) : null}
        </div>
        <CardTitle className="mt-2">
          {story.title}
        </CardTitle>
        {story.excerpt ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{story.excerpt}</p>
        ) : null}
        <CardMeta className="mt-auto pt-3">
          {author ? (
            <CardMetaItem icon={UserRound}>{author}</CardMetaItem>
          ) : null}
          {readingMinutes ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3" aria-hidden />
              {readingMinutes} {dict.news.minRead}
            </span>
          ) : null}
          {story.location ? (
            <CardMetaItem icon={MapPin}>{story.location}</CardMetaItem>
          ) : null}
          {story.publishedAt ? (
            <CardMetaItem icon={Clock}>{formatDate(story.publishedAt, locale)}</CardMetaItem>
          ) : null}
        </CardMeta>
      </div>
    </CardShell>
    {showSave ? (
      <SaveButton
        contentItemId={story.id}
        labels={saveLabels(dict)}
        className="absolute right-2 top-2"
      />
    ) : null}
    </div>
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
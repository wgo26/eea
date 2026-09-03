import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { timeAgo, type Dictionary, type Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

type TrendingListProps = {
  stories: StoryCardData[];
  dict: Dictionary;
  locale: Locale;
};

/**
 * Numbered "Trending now" rail (spec §1A): a scannable ranked list of recent
 * stories that are not already displayed in a homepage section.
 */
export function TrendingList({ stories, dict, locale }: TrendingListProps) {
  if (stories.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="border-b pb-3">
        <h3 className="text-sm font-extrabold uppercase tracking-tight">
          {dict.home.trending}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{dict.home.trendingHint}</p>
      </div>
      <ol className="divide-y">
        {stories.map((story, index) => (
          <li key={story.id}>
            <Link href={story.href} className="group flex gap-3 py-3">
              <span
                className="text-xl font-extrabold leading-none text-primary/40 transition-colors group-hover:text-primary"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                  {story.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {story.category ? <span>{story.category}</span> : null}
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
          </li>
        ))}
      </ol>
    </div>
  );
}
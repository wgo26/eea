import Link from "next/link";
import { BadgeCheck, MapPin, Megaphone } from "lucide-react";
import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

type NoticesListProps = {
  notices: StoryCardData[];
  dict: Dictionary;
  locale: Locale;
};

/**
 * Compact notices strip — official notices are visually distinct from
 * community submissions (spec §5 + Differentiator #5).
 */
export function NoticesList({ notices, dict, locale }: NoticesListProps) {
  if (notices.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
        {dict.common.comingSoon}
      </p>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border">
      {notices.map((notice) => (
        <li key={notice.id}>
          <Link
            href={notice.href}
            className="group flex items-start gap-3 p-4 transition-colors hover:bg-muted/50"
          >
            {notice.isOfficial ? (
              <BadgeCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
            ) : (
              <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    notice.isOfficial
                      ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {notice.isOfficial ? dict.badges.official : dict.badges.community}
                </span>
                {notice.noticeType ? (
                  <span className="text-[11px] text-muted-foreground">
                    {notice.noticeType.replaceAll("_", " ")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-semibold leading-snug group-hover:underline">
                {notice.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {notice.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {notice.location}
                  </span>
                ) : null}
                {notice.expiresAt ? (
                  <span>
                    {dict.home.expires}: {formatDate(notice.expiresAt, locale)}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

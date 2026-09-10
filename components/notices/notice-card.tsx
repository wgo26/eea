import Link from "next/link";
import { Building2, Mail, MapPin, Phone, Share2 } from "lucide-react";

import { PrintButton } from "@/components/notices/print-button";
import { cn } from "@/lib/utils";
import { expiryLabel, whatsappHref } from "@/lib/format";
import { SITE } from "@/lib/constants";
import { localePath } from "@/lib/i18n/urls";
import { isExpiringSoon, isExpired, noticeTypeLabel, noticeTypeMeta } from "@/lib/notice-types";
import { verificationBadgeInfo } from "@/lib/verification";
import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import type { NoticeData } from "@/lib/queries/notices";

type NoticeCardProps = {
    notice: NoticeData;
    dict: Dictionary;
    locale: Locale;
    className?: string;
};

/**
 * One row on the community notice board.
 *
 * Notices are scanned by *type* first, so the card leads with a coloured
 * spine and type icon rather than a photograph, and states plainly when it
 * stops being true. Official notices are visually louder than community
 * submissions (spec §5 + Differentiator #5).
 */
export function NoticeCard({ notice, dict, locale, className }: NoticeCardProps) {
    const meta = noticeTypeMeta(notice.noticeType);
    const TypeIcon = meta.icon;
    const badge = verificationBadgeInfo(
        notice.isOfficial ? "official_source" : (notice.verification ?? null),
        dict,
    );

    const expired = isExpired(notice.expiresAt);
    const soon = isExpiringSoon(notice.expiresAt);
    const shareUrl = `${SITE.url}${localePath(locale, notice.href)}`;

    return (
        <article
            className={cn(
                "group relative flex overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md",
                expired && "opacity-75",
                className,
            )}
        >
            {/* Type spine */}
            <span
                className={cn("w-1.5 shrink-0", meta.spine, expired && "opacity-40")}
                aria-hidden
            />

            <div className="flex min-w-0 flex-1 gap-4 p-4">
                {/* Type icon */}
                <span
                    className={cn(
                        "hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex",
                        meta.chip,
                    )}
                    aria-hidden
                >
                    <TypeIcon className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                    {/* Meta line */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                                meta.chip,
                            )}
                        >
                            <TypeIcon className="h-3 w-3 sm:hidden" aria-hidden />
                            {noticeTypeLabel(notice.noticeType)}
                        </span>
                        {badge ? (
                            <span
                                className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                    badge.className,
                                )}
                            >
                                {badge.label}
                            </span>
                        ) : null}
                        {notice.expiresAt ? (
                            <span
                                className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                    expired
                                        ? "bg-muted text-muted-foreground"
                                        : soon
                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                            : "bg-muted text-muted-foreground",
                                )}
                            >
                                {expiryLabel(notice.expiresAt, locale, dict)}
                            </span>
                        ) : null}
                    </div>

                    {/* Headline */}
                    <h3 className="mt-2 text-base font-bold leading-snug tracking-tight">
                        <Link href={notice.href} className="hover:underline">
                            {notice.title}
                        </Link>
                    </h3>

                    {notice.excerpt ? (
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                            {notice.excerpt}
                        </p>
                    ) : null}

                    {/* Where / who / when */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {notice.location ? (
                            <Link
                                href={`/locations/${notice.locationSlug ?? ""}`}
                                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                            >
                                <MapPin className="h-3.5 w-3.5" aria-hidden />
                                {notice.location}
                            </Link>
                        ) : null}
                        {notice.organizationName ? (
                            <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5" aria-hidden />
                                {notice.organizationName}
                            </span>
                        ) : null}
                        {notice.publishedAt ? (
                            <span>
                                {dict.notices.posted} {formatDate(notice.publishedAt, locale)}
                            </span>
                        ) : null}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {notice.hasContact && notice.organizationName ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                <Phone className="h-3.5 w-3.5" aria-hidden />
                                {notice.organizationName}
                            </span>
                        ) : null}
                        <a
                            href={whatsappHref(shareUrl, `${notice.title} —`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={dict.notices.shareWhatsapp}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <Share2 className="h-3.5 w-3.5" aria-hidden />
                            <span className="hidden sm:inline">{dict.common.share}</span>
                        </a>
                        <PrintButton
                            dict={dict}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        />
                    </div>
                </div>

                {/* Thumbnail */}
                {notice.imageUrl ? (
                    <Link
                        href={notice.href}
                        className="relative hidden h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-muted md:block"
                        tabIndex={-1}
                        aria-hidden
                    >
                        <span
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.05]"
                            style={{ backgroundImage: `url(${notice.imageUrl})` }}
                        />
                    </Link>
                ) : null}
            </div>
        </article>
    );
}

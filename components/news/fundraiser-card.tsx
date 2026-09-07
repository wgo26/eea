import Link from "next/link";
import { ExternalLink, HeartHandshake, MapPin, Phone, Share2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { countdownLabel, formatMoney, formatMoneyCompact, whatsappHref } from "@/lib/format";
import { verificationBadgeInfo } from "@/lib/verification";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { FundraiserData } from "@/lib/queries/fundraisers";

type FundraiserCardProps = {
    campaign: FundraiserData;
    dict: Dictionary;
    locale: Locale;
    /** Absolute URL of the campaign, used for the WhatsApp share link. */
    shareUrl: string;
    className?: string;
};

/**
 * A single fundraising campaign (spec §26 — community fundraising tied to
 * local needs). Progress is always visible so the community can see exactly
 * where a campaign stands rather than taking an appeal on trust.
 */
export function FundraiserCard({
    campaign,
    dict,
    locale,
    shareUrl,
    className,
}: FundraiserCardProps) {
    const badge = verificationBadgeInfo(campaign.verification ?? null, dict);
    const countdown = countdownLabel(campaign.deadlineAt, dict);
    const goalReached = campaign.percent >= 100;

    return (
        <article
            className={cn(
                "group flex flex-col overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-md",
                className,
            )}
        >
            <Link href={campaign.href} className="relative block">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                    {campaign.imageUrl ? (
                        <span
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.03]"
                            style={{ backgroundImage: `url(${campaign.imageUrl})` }}
                            role="img"
                            aria-label={campaign.title}
                        />
                    ) : null}
                    <span
                        className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5"
                        aria-hidden
                    />
                    <span className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                        {badge ? (
                            <span
                                className={cn(
                                    "rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm",
                                    badge.className,
                                )}
                            >
                                {badge.label}
                            </span>
                        ) : null}
                    </span>
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur">
                        {campaign.percent}% {dict.fundraisers.funded}
                    </span>
                </div>
            </Link>

            <div className="flex flex-1 flex-col p-4">
                <h3 className="text-base font-bold leading-snug tracking-tight">
                    <Link href={campaign.href} className="hover:underline">
                        {campaign.title}
                    </Link>
                </h3>
                {campaign.excerpt ? (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {campaign.excerpt}
                    </p>
                ) : null}

                {/* Progress */}
                <div className="mt-4">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="text-lg font-extrabold tabular-nums">
                            {formatMoney(campaign.raisedAmount, campaign.currency, locale)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {dict.fundraisers.raised}
                        </span>
                    </div>
                    <div
                        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={campaign.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${campaign.percent}% ${dict.fundraisers.funded}`}
                    >
                        <div
                            className={cn(
                                "h-full rounded-full transition-[width] duration-700",
                                goalReached ? "bg-emerald-500" : "bg-primary",
                            )}
                            style={{ width: `${Math.max(campaign.percent, 2)}%` }}
                        />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {goalReached ? (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {dict.fundraisers.goalReached}
                            </span>
                        ) : (
                            <>
                                {dict.fundraisers.ofGoal}{" "}
                                <strong className="font-semibold text-foreground">
                                    {formatMoneyCompact(campaign.goalAmount, campaign.currency, locale)}
                                </strong>
                            </>
                        )}
                        {countdown ? (
                            <>
                                {" · "}
                                <span
                                    className={cn(
                                        countdown === dict.fundraisers.closed
                                            ? "text-muted-foreground"
                                            : "text-amber-700 dark:text-amber-400",
                                    )}
                                >
                                    {countdown}
                                </span>
                            </>
                        ) : null}
                    </p>
                </div>

                {/* Organizer */}
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    {campaign.organizerName ? (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <HeartHandshake className="h-3.5 w-3.5 text-primary" aria-hidden />
                            {campaign.organizerName}
                        </span>
                    ) : null}
                    {campaign.location ? (
                        <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {campaign.location}
                        </span>
                    ) : null}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {campaign.donationUrl ? (
                        <a
                            href={campaign.donationUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            {dict.fundraisers.donate}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                    ) : campaign.organizerPhone ? (
                        <a
                            href={`tel:${campaign.organizerPhone.replace(/\s+/g, "")}`}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                            {dict.fundraisers.contactOrganizer}
                        </a>
                    ) : null}
                    <a
                        href={whatsappHref(
                            shareUrl,
                            `${campaign.title} —`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={dict.fundraisers.shareCampaign}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Share2 className="h-4 w-4" aria-hidden />
                    </a>
                </div>

                {campaign.verificationNotes ? (
                    <p className="mt-3 rounded-xl bg-muted/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                        {campaign.verificationNotes}
                    </p>
                ) : null}
            </div>
        </article>
    );
}

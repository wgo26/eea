import Link from "next/link";
import { ArrowRight, HeartHandshake, Sparkles } from "lucide-react";

import { FundraiserCard } from "@/components/news/fundraiser-card";
import { SectionHeader } from "@/components/home/section-header";
import { Button } from "@/components/ui/button";
import { formatMoneyCompact, percentRaised } from "@/lib/format";
import { localePath } from "@/lib/i18n/urls";
import { cn } from "@/lib/utils";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { FundraiserData } from "@/lib/queries/fundraisers";

type FundraisingSectionProps = {
    campaigns: FundraiserData[];
    dict: Dictionary;
    locale: Locale;
    stats: { active: number; totalRaised: number; totalGoal: number; currency: string; completed: number };
    siteUrl: string;
};

/** Headline figures above the campaign grid. */
function StatBlock({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
    return (
        <div className="min-w-0">
            <p
                className={cn(
                    "truncate text-xl font-extrabold tabular-nums md:text-2xl",
                    accent ? "text-primary" : "text-foreground",
                )}
            >
                {value}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
        </div>
    );
}

/**
 * Community Fundraising band on the news page.
 *
 * Deliberately shows the money, the progress and who is behind each campaign —
 * an appeal the community can audit is worth far more than an appeal it has
 * to take on trust.
 */
export function FundraisingSection({
    campaigns,
    dict,
    locale,
    stats,
    siteUrl,
}: FundraisingSectionProps) {
    const fundedPercent = percentRaised(stats.totalRaised, stats.totalGoal);

    return (
        <section aria-labelledby="fundraising-heading">
            <div id="fundraising-heading">
                <SectionHeader
                    title={dict.fundraisers.title}
                    hint={dict.fundraisers.tagline}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                    {campaigns.length === 0 ? (
                        <div className="flex flex-col items-start gap-4 rounded-3xl border border-dashed p-8 sm:flex-row sm:items-center">
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <HeartHandshake className="h-6 w-6" aria-hidden />
                            </span>
                            <div className="min-w-0">
                                <p className="text-base font-bold">{dict.fundraisers.empty}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {dict.fundraisers.emptyBody}
                                </p>
                            </div>
                            <Button render={<Link href={localePath(locale, "/submit/news")} />} className="sm:ml-auto">
                                {dict.fundraisers.startCampaign}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Stats band */}
                            <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border bg-muted/40 px-5 py-4">
                                <StatBlock
                                    value={formatMoneyCompact(
                                        stats.totalRaised,
                                        stats.currency,
                                        locale,
                                    )}
                                    label={dict.fundraisers.totalRaised}
                                    accent
                                />
                                <StatBlock
                                    value={String(stats.active)}
                                    label={dict.fundraisers.activeCampaigns}
                                />
                                <StatBlock
                                    value={String(stats.completed)}
                                    label={dict.fundraisers.campaignsClosed}
                                />
                                <StatBlock
                                    value={`${fundedPercent}%`}
                                    label={dict.fundraisers.fundedLabel}
                                />
                            </div>

                            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                {campaigns.map((campaign) => (
                                    <FundraiserCard
                                        key={campaign.id}
                                        campaign={campaign}
                                        dict={dict}
                                        locale={locale}
                                        shareUrl={`${siteUrl}${campaign.href}`}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* How it works + start a campaign */}
                <aside className="space-y-4">
                    <div className="rounded-3xl border bg-card p-5">
                        <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em]">
                            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                            {dict.fundraisers.howItWorks}
                        </p>
                        <ol className="mt-4 space-y-4">
                            {[dict.fundraisers.step1, dict.fundraisers.step2, dict.fundraisers.step3].map(
                                (step, index) => (
                                    <li key={index} className="flex gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                                            {index + 1}
                                        </span>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            {step}
                                        </p>
                                    </li>
                                ),
                            )}
                        </ol>
                    </div>

                    <div className="rounded-3xl border bg-foreground p-5 text-background">
                        <HeartHandshake className="h-6 w-6 text-primary" aria-hidden />
                        <p className="mt-3 text-base font-extrabold">
                            {dict.fundraisers.startCampaign}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed opacity-80">
                            {dict.fundraisers.startCampaignBody}
                        </p>
                        <Button
                            render={<Link href={localePath(locale, "/submit/news")} />}
                            className="mt-4 w-full"
                            variant="secondary"
                        >
                            {dict.fundraisers.startCampaign}
                            <ArrowRight data-icon="inline-end" aria-hidden />
                        </Button>
                    </div>
                </aside>
            </div>
        </section>
    );
}

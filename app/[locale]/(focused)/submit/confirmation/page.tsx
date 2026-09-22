import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { ModerationTimeline } from "@/components/submit/moderation-timeline";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    return {
        title: getDictionary(locale).submit.successTitle,
        robots: { index: false, follow: false },
    };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return (
        <div className="mx-auto w-full max-w-xl px-4 py-16 text-center md:px-6 lg:px-8">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" aria-hidden />
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight md:text-3xl">
                {dict.submit.successTitle}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
                {dict.submit.successBody}
            </p>
            {/* Phase 3 — moderation timeline: what happens next, no polling needed. */}
            <div className="mt-8 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-card md:p-5">
                <p className="mb-3 text-sm font-bold">{dict.submit.timelineTrackTitle}</p>
                <ModerationTimeline
                    stage="submitted"
                    copy={{
                        submitted: dict.submit.timelineSubmitted,
                        submittedBody: dict.submit.timelineSubmittedBody,
                        inReview: dict.submit.timelineInReview,
                        inReviewBody: dict.submit.timelineInReviewBody,
                        published: dict.submit.timelinePublished,
                        publishedBody: dict.submit.timelinePublishedBody,
                        rejected: dict.submit.timelineRejected,
                        rejectedBody: dict.submit.timelineRejectedBody,
                    }}
                />
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button render={<Link href={localePath(locale, "/submit")} />} variant="outline">
                    {dict.submit.title}
                </Button>
                <Button render={<Link href={localePath(locale, "/")} />}>{dict.nav.home}</Button>
            </div>
        </div>
    );
}

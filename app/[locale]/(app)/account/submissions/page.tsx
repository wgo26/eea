import Link from "next/link";
import { Package, PenLine } from "lucide-react";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { localizeStatus, localizeType } from "@/lib/admin/labels";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import {
    AccountActionTile,
    AccountBadge,
    AccountCard,
    AccountEmptyState,
    AccountPageShell,
} from "@/components/account/account-page-shell";
import { Pager } from "@/components/admin/pager";
import { WithdrawSubmissionButton } from "@/components/account/withdraw-submission-button";
import { ResubmitSubmissionButton } from "@/components/account/resubmit-submission-button";
import { ModerationTimeline, stageForStatus } from "@/components/submit/moderation-timeline";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.submissions.title };
}

const PAGE_SIZE = 20;

/** Submission status → the unified pill tone (matches the dashboard). */
function toneFor(status: string | null): "neutral" | "primary" | "success" | "warning" | "danger" {
    switch (status) {
        case "published":
        case "approved":
            return "success";
        case "rejected":
        case "withdrawn":
            return "danger";
        case "in_review":
        case "needs_clarification":
            return "warning";
        case "pending":
            return "primary";
        default:
            return "neutral";
    }
}

type SubmissionRow = {
    id: string;
    status: string | null;
    submission_type: string | null;
    submitted_at: string | null;
    submitted_by?: string | null;
    reviewed_at?: string | null;
    rejection_reason?: string | null;
    payload: Record<string, string> | null;
};

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.dashboard;
    const e = dict.account.empty;
    const common = dict.admin.common;
    const { supabase, user } = await requireUser("/account/submissions");

    const params = await searchParams;
    const rawPage = Number(params.page ?? "1");
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
        .from("submissions")
        .select(
            "id, status, submission_type, submitted_at, submitted_by, reviewed_at, rejection_reason, payload",
            { count: "exact" },
        )
        .order("submitted_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
    if (user.email) {
        query = query.or(`submitted_by.eq.${user.id},guest_email.eq.${user.email}`);
    } else {
        query = query.eq("submitted_by", user.id);
    }
    const { data, count } = await query;
    const rows = (data ?? []) as SubmissionRow[];
    const total = count ?? 0;

    const base = localePath(locale, "/account/submissions");


    return (
        <AccountPageShell
            title={dict.account.submissions.title}
            description={dict.account.submissions.description}
            size="wide"
            breadcrumb={accountPageBreadcrumb(locale, "/account/submissions")}
            actions={
                <Link
                    href={localePath(locale, "/submit")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    <PenLine className="h-4 w-4" aria-hidden />
                    {t.linkSubmit}
                </Link>
            }
        >
            <AccountActionTile
                href={localePath(locale, "/account/listings")}
                icon={Package}
                label={dict.buySell.myListings}
                hint={dict.buySell.myListingsBody}
            />

            {rows.length === 0 ? (
                <AccountEmptyState
                    icon={PenLine}
                    title={e.submissionsTitle}
                    body={e.submissionsBody}
                    actionLabel={e.submissionsCta}
                    actionHref={localePath(locale, "/submit")}
                />
            ) : (
                <SubmissionList rows={rows} userId={user.id} dict={dict} locale={locale} />
            )}

            {rows.length > 0 ? (
                <>
                    <p className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                        {dict.submit.deletePolicy}
                    </p>
                    <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(pn) => `${base}?page=${pn}`} copy={common} />
                </>
            ) : null}
        </AccountPageShell>
    );
}

/**
 * Interactive submission cards (Account audit §3 Phase 3): a status pill in
 * the area's shared tone, the editor's decision note when there is one, the
 * compact pipeline position, and the withdraw/resubmit tap — only for rows
 * the member actually owns (a legacy guest row cannot be mutated).
 */
function SubmissionList({
    rows,
    userId,
    dict,
    locale,
}: {
    rows: SubmissionRow[];
    userId: string;
    dict: Dictionary;
    locale: Locale;
}) {
    const t = dict.account.dashboard;
    const title = (s: SubmissionRow) =>
        s.payload?.headline ||
        s.payload?.item ||
        s.payload?.what ||
        (s.submission_type ? localizeType(s.submission_type, dict.admin.common) : t.statSubmissions);
    const day = (value: string | null) =>
        value ? new Date(value).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB") : "";

    return (
        <div className="space-y-3">
            {rows.map((s) => {
                const owned = s.submitted_by === userId;
                const canWithdraw = owned && (s.status === "pending" || s.status === "in_review");
                const canResubmit = owned && (s.status === "rejected" || s.status === "withdrawn");
                const decision = day(s.reviewed_at ?? null);
                return (
                    <AccountCard key={s.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate font-medium">{title(s)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {s.submitted_at ? day(s.submitted_at) : t.submittedRecently}
                                    {s.submission_type
                                        ? ` · ${localizeType(s.submission_type, dict.admin.common)}`
                                        : ""}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {canWithdraw ? <WithdrawSubmissionButton submissionId={s.id} dict={dict} /> : null}
                                {canResubmit ? <ResubmitSubmissionButton submissionId={s.id} dict={dict} /> : null}
                                <AccountBadge tone={toneFor(s.status)}>
                                    {s.status ? localizeStatus(s.status, dict.admin.common) : t.pending}
                                </AccountBadge>
                            </div>
                        </div>

                        {/* Editor feedback the member can act on (internal_notes
                            stays hidden — RLS exposes the row, not the notes). */}
                        {s.rejection_reason ? (
                            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed">
                                {s.rejection_reason}
                            </p>
                        ) : null}

                        <div className="mt-3 border-t border-border/60 pt-3">
                            <ModerationTimeline
                                stage={stageForStatus(s.status)}
                                compact
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
                        {decision ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                {dict.account.submissions.reviewedOn} {decision}
                            </p>
                        ) : null}
                    </AccountCard>
                );
            })}
        </div>
    );
}
import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { localizeStatus, localizeType } from "@/lib/admin/labels";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Pager } from "@/components/admin/pager";
import { WithdrawSubmissionButton } from "@/components/account/withdraw-submission-button";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    return { title: dict.account.dashboard.recentSubmissions };
}

const PAGE_SIZE = 20;

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t = dict.account.dashboard;
    const common = dict.admin.common;
    const { supabase, user } = await requireUser("/account/submissions");

    const params = await searchParams;
    const rawPage = Number(params.page ?? "1");
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const offset = (page - 1) * PAGE_SIZE;

    let query = supabase
        .from("submissions")
        .select("id, status, submission_type, submitted_at, payload", { count: "exact" })
        .order("submitted_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
    if (user.email) {
        query = query.or(`submitted_by.eq.${user.id},guest_email.eq.${user.email}`);
    } else {
        query = query.eq("submitted_by", user.id);
    }
    const { data, count } = await query;
    const rows = (data ?? []) as { id: string; status: string | null; submission_type: string | null; submitted_at: string | null; payload: Record<string, string> | null }[];
    const total = count ?? 0;

    const base = localePath(locale, "/account/submissions");
    const submissionTitle = (s: (typeof rows)[number]) =>
        s.payload?.headline || s.payload?.item || s.payload?.what || (s.submission_type ? localizeType(s.submission_type, common) : t.statSubmissions);

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
            <PageHeader title={t.recentSubmissions} description={t.contributorSubtitle} />
            <Link
                href={localePath(locale, "/account/listings")}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3 text-sm font-medium transition hover:bg-muted"
            >
                {dict.buySell.myListings} →
            </Link>
            {rows.length === 0 ? (
                <EmptyState
                    message={t.emptySubmissions}
                    action={
                        <Link
                            href={localePath(locale, "/submit")}
                            className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3 text-sm font-medium transition hover:bg-muted"
                        >
                            {t.linkSubmit}
                        </Link>
                    }
                />
            ) : (
                <>
                    <div className="space-y-3">
                        {rows.map((s) => (
                            <div key={s.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3">
                                <div className="min-w-0">
                                    <p className="font-medium truncate">
                                        {submissionTitle(s)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {s.submitted_at
                                            ? new Date(s.submitted_at).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB")
                                            : t.submittedRecently}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {(s.status === "pending" || s.status === "in_review") ? (
                                        <WithdrawSubmissionButton submissionId={s.id} dict={dict} />
                                    ) : null}
                                    <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                        {s.status ? localizeStatus(s.status, common) : t.pending}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                        {dict.submit.deletePolicy}
                    </p>
                    <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(pn) => `${base}?page=${pn}`} copy={common} />
                </>
            )}
        </div>
    );
}

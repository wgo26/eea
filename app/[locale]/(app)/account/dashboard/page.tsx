import Link from "next/link";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { getDashboardStats } from "@/lib/admin/queries";
import { requireUser } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.topbar.dashboard };
}

type SubmissionRow = {
    id: string;
    status: string | null;
    submission_type?: string | null;
    submitted_at?: string | null;
};

type ContentRow = {
    id: string;
    type?: string | null;
    status?: string | null;
    title?: string | null;
    published_at?: string | null;
};

type Copy = Dictionary["account"]["dashboard"];

function formatRole(role: string) {
    return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function DashboardCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}

function ActivityRow({ title, meta, status, fallback }: { title: string; meta: string; status: string | null; fallback: string }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-3">
            <div>
                <p className="font-medium capitalize">{title}</p>
                <p className="text-xs text-muted-foreground">{meta}</p>
            </div>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                {status || fallback}
            </span>
        </div>
    );
}

function ActionLink({ href, label }: { href: string; label: string }) {
    return (
        <Link
            href={href}
            className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3 text-sm font-medium transition hover:bg-muted"
        >
            <span>{label}</span>
            <span aria-hidden="true">→</span>
        </Link>
    );
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t: Copy = dict.account.dashboard;
    const p = (path: string) => localePath(locale, path);

    const { supabase, user } = await requireUser("/account/dashboard");

    const [rolesRes, profileRes, submissionsRes, contentRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name, display_name, bio").eq("id", user.id).maybeSingle(),
        supabase
            .from("submissions")
            .select("id, status, submission_type, submitted_at")
            .eq("guest_email", user.email ?? "")
            .order("submitted_at", { ascending: false })
            .limit(5),
        supabase
            .from("content_items")
            .select("id, type, title, status, published_at")
            .eq("author_id", user.id)
            .order("published_at", { ascending: false })
            .limit(5),
    ]);

    const roles = (rolesRes.data ?? []).map((row: { role?: string }) => row.role).filter(Boolean) as string[];
    const profile = profileRes.data;
    const email = user.email ?? "your.email@example.com";
    const displayName = profile?.display_name || profile?.full_name || email.split("@")[0] || t.member;
    const submissions = (submissionsRes.data ?? []) as SubmissionRow[];
    const publishedContent = (contentRes.data ?? []) as ContentRow[];

    const isAdmin = roles.includes("admin");
    const isEditor = roles.includes("editor");
    const isAdvertiser = roles.includes("advertiser");
    const isContributor = roles.includes("contributor");
    const isStaff = isAdmin || isEditor;

    const formattedDate = (value: string | null | undefined) =>
        value ? new Date(value).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB") : t.submittedRecently;

    /* ------------------------------------------------ staff variant --- */
    if (isStaff) {
        const stats = await getDashboardStats();

        return (
            <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 lg:py-12">
                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.staffKicker}</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{displayName}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">{isAdmin ? t.adminAccess : t.editorAccess}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {roles.map((role) => (
                                <span key={role} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                                    {formatRole(role)}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardCard label={t.statPending} value={String(stats.pendingSubmissions)} hint={t.hintAwaitingReview} />
                    <DashboardCard label={t.statPublishedToday} value={String(stats.publishedToday)} hint={t.hintLive} />
                    <DashboardCard label={t.statScheduled} value={String(stats.scheduled)} hint={t.hintFuture} />
                    <DashboardCard label={t.statActiveAds} value={String(stats.activeAds)} hint={t.hintCampaigns} />
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-xl font-semibold">{t.operations}</h2>
                        <div className="mt-5 space-y-3">
                            <ActionLink href={p("/admin/dashboard")} label={t.linkAdminDashboard} />
                            <ActionLink href={p("/admin/moderation")} label={t.linkModeration} />
                            <ActionLink href={p("/admin/content")} label={t.linkContentLibrary} />
                            {isAdmin && <ActionLink href={p("/admin/users")} label={t.linkUserRoles} />}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-xl font-semibold">{t.editorialSnapshot}</h2>
                        <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                            <p>{t.statPending}: {stats.pendingSubmissions}</p>
                            <p>{t.statDrafts}: {stats.draftCount}</p>
                            <p>{dict.admin.dashboard.photoStories}: {stats.totalStories}</p>
                            <p>{dict.admin.dashboard.communityNews}: {stats.totalNews}</p>
                            <p>{dict.admin.dashboard.buySell}: {stats.totalListings}</p>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    /* -------------------------------------------- advertiser variant --- */
    if (isAdvertiser) {
        return (
            <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 lg:py-12">
                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.advertiserKicker}</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{displayName}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">{t.advertiserSubtitle}</p>
                        </div>
                        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                            {roles.map(formatRole).join(", ") || formatRole("advertiser")}
                        </span>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardCard label={t.statCampaigns} value="0" hint={t.hintActiveMonth} />
                    <DashboardCard label={t.statReach} value="0" hint={t.hintImpressions} />
                    <DashboardCard label={t.statClicks} value="0" hint={t.hintEngagement} />
                    <DashboardCard label={t.statSpend} value="$0" hint={t.hintBudget} />
                </section>

                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="text-xl font-semibold">{t.quickActions}</h2>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <Link href={p("/advertise")} className="rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium transition hover:bg-muted">
                            {t.linkCreateCampaign}
                        </Link>
                        <Link href={p("/admin/ads")} className="rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium transition hover:bg-muted">
                            {t.linkReviewAds}
                        </Link>
                        <Link href={p("/")} className="rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium transition hover:bg-muted">
                            {t.linkExplorePages}
                        </Link>
                    </div>
                </section>
            </div>
        );
    }

    /* ------------------------------------------ contributor variant --- */
    if (isContributor) {
        return (
            <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 lg:py-12">
                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.contributorKicker}</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{displayName}</h1>
                            <p className="mt-2 text-sm text-muted-foreground">{t.contributorSubtitle}</p>
                        </div>
                        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                            {roles.map(formatRole).join(", ") || formatRole("contributor")}
                        </span>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardCard label={t.statSubmissions} value={String(submissions.length)} hint={t.hintRecent} />
                    <DashboardCard
                        label={t.statPublished}
                        value={String(publishedContent.filter((item) => item.status === "published").length)}
                        hint={t.hintLiveStories}
                    />
                    <DashboardCard
                        label={t.statDrafts}
                        value={String(publishedContent.filter((item) => item.status === "draft").length)}
                        hint={t.hintInProgress}
                    />
                    <DashboardCard label={t.statProfile} value={t.member} hint={t.hintContributor} />
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-xl font-semibold">{t.recentSubmissions}</h2>
                        <div className="mt-5 space-y-3">
                            {submissions.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                                    {t.emptySubmissions}
                                </div>
                            ) : (
                                submissions.map((submission) => (
                                    <ActivityRow
                                        key={submission.id}
                                        title={submission.submission_type || t.statSubmissions}
                                        meta={formattedDate(submission.submitted_at)}
                                        status={submission.status}
                                        fallback={t.pending}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-xl font-semibold">{t.contributorTools}</h2>
                        <div className="mt-5 space-y-3">
                            <ActionLink href={p("/submit")} label={t.linkSubmit} />
                            <ActionLink href={p("/contributors")} label={t.linkBrowseContributors} />
                            <ActionLink href={p("/")} label={t.linkExploreCommunity} />
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    /* ------------------------------------------------ member variant --- */
    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6 lg:py-12">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.memberKicker}</p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{displayName}</h1>
                        <p className="mt-2 text-sm text-muted-foreground">{t.memberSubtitle}</p>
                    </div>
                    <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium capitalize text-muted-foreground">
                        {roles.length > 0 ? roles.map(formatRole).join(", ") : t.member}
                    </span>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardCard label={t.statSubmissions} value={String(submissions.length)} hint={t.hintRecent} />
                <DashboardCard label={t.statSaved} value="0" hint={t.hintBookmarks} />
                <DashboardCard label={t.statFollowed} value="0" hint={t.hintFollows} />
                <DashboardCard label={t.statAccess} value={t.member} hint={t.hintStandard} />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="text-xl font-semibold">{t.recentActivity}</h2>
                    <div className="mt-5 space-y-3">
                        {submissions.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                                {t.emptyActivity}
                            </div>
                        ) : (
                            submissions.map((submission) => (
                                <ActivityRow
                                    key={submission.id}
                                    title={submission.submission_type || t.statSubmissions}
                                    meta={formattedDate(submission.submitted_at)}
                                    status={submission.status}
                                    fallback={t.pending}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="text-xl font-semibold">{t.recommendedActions}</h2>
                    <div className="mt-5 space-y-3">
                        <ActionLink href={p("/submit")} label={t.linkSubmit} />
                        <ActionLink href={p("/")} label={t.linkExploreHome} />
                        <ActionLink href={p("/account/dashboard")} label={t.linkAccountSettings} />
                    </div>
                </div>
            </section>
        </div>
    );
}
import Link from "next/link";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { getDashboardStats } from "@/lib/admin/queries";
import { requireUser } from "@/lib/auth/guards";
import { localizeStatus, localizeType } from "@/lib/admin/labels";
import { EmptyState } from "@/components/admin/empty-state";
import { ProfileEditDialog } from "@/components/account/profile-edit-dialog";

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

type ContentDbRow = {
    id: string;
    type: string | null;
    status: string | null;
    published_at: string | null;
    translations: { locale: string; title: string | null } | { locale: string; title: string | null }[] | null;
};

type CampaignRow = {
    id: string;
    name: string;
    status: string | null;
    agreed_price: number | string | null;
    currency: string | null;
};

type Copy = Dictionary["account"]["dashboard"];

function RoleBadge({ role, copy }: { role: string; copy: Copy }) {
    const label =
        role === "admin" ? copy.roleAdmin
        : role === "editor" ? copy.roleEditor
        : role === "contributor" ? copy.roleContributor
        : role === "advertiser" ? copy.roleAdvertiser
        : role.replace(/_/g, " ");
    return (
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {label}
        </span>
    );
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

function ActivityRow({
    title,
    meta,
    status,
    fallback,
    common,
}: {
    title: string;
    meta: string;
    status: string | null;
    fallback: string;
    common: Dictionary["admin"]["common"];
}) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-3">
            <div className="min-w-0">
                <p className="font-medium truncate">{title}</p>
                <p className="text-xs text-muted-foreground">{meta}</p>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {status ? localizeStatus(status, common) : fallback}
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

function formatXaf(value: number | string | null, copy: Copy): string {
    const n = typeof value === "string" ? Number(value) : (value ?? 0);
    if (!Number.isFinite(n) || n === 0) return copy.statSpendXaf.replace("{amount}", "0");
    return copy.statSpendXaf.replace("{amount}", Math.round(n).toLocaleString());
}

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t: Copy = dict.account.dashboard;
    const common = dict.admin.common;
    const p = (path: string) => localePath(locale, path);

    const { supabase, user } = await requireUser("/account/dashboard");

    // History must survive both paths: authenticated submits (submitted_by)
    // and legacy guest rows (submitted_by null, guest_email match — see
    // migration 20260926000000). RLS mirrors the same OR.
    const applySubmissionScope = <T,>(q: T): T => {
        type Q = {
            or: (f: string) => T
            eq: (c: string, v: string) => T
        }
        const qq = q as unknown as Q
        if (user.email) {
            return qq.or(`submitted_by.eq.${user.id},guest_email.eq.${user.email}`) as unknown as T
        }
        return qq.eq("submitted_by", user.id) as unknown as T
    };

    const mapContentRow = (row: ContentDbRow): ContentRow => {
        const list = Array.isArray(row.translations)
            ? row.translations
            : row.translations
              ? [row.translations]
              : [];
        const found = list.find((x) => x.locale === locale) ?? list[0];
        return {
            id: row.id,
            type: row.type,
            status: row.status,
            title: found?.title ?? null,
            published_at: row.published_at,
        };
    };

    const [
        rolesRes,
        profileRes,
        submissionsRes,
        submissionsCountRes,
        contentRes,
        publishedCountRes,
        draftCountRes,
        savedCountRes,
        followsCountRes,
        advertiserRes,
    ] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("full_name, display_name, bio").eq("id", user.id).maybeSingle(),
        applySubmissionScope(
            supabase
                .from("submissions")
                .select("id, status, submission_type, submitted_at", { count: "exact" })
                .order("submitted_at", { ascending: false }),
        ).limit(5),
        applySubmissionScope(
            supabase.from("submissions").select("id", { count: "exact", head: true }),
        ),
        supabase
            .from("content_items")
            .select("id, type, status, published_at, translations:content_translations(locale, title)")
            .eq("author_id", user.id)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(5),
        supabase
            .from("content_items")
            .select("id", { count: "exact", head: true })
            .eq("author_id", user.id)
            .eq("status", "published"),
        supabase
            .from("content_items")
            .select("id", { count: "exact", head: true })
            .eq("author_id", user.id)
            .eq("status", "draft"),
        supabase.from("saved_content").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("content_follows").select("user_id", { count: "exact", head: true }).eq("user_id", user.id),
        // Advertiser stats: own campaigns via advertisers.user_id (RLS allows).
        supabase
            .from("advertisers")
            .select("id, ad_campaigns(id, name, status, agreed_price, currency)")
            .eq("user_id", user.id),
    ]);

    const roles = (rolesRes.data ?? []).map((row: { role?: string }) => row.role).filter(Boolean) as string[];
    const profile = profileRes.data as { display_name?: string | null; full_name?: string | null; bio?: string | null } | null;
    const email = user.email ?? "";
    const displayName = profile?.display_name || profile?.full_name || (email ? email.split("@")[0] : t.member);
    const submissions = (submissionsRes.data ?? []) as SubmissionRow[];
    const submissionsTotal = submissionsCountRes.count ?? submissions.length;
    const publishedContent = ((contentRes.data ?? []) as unknown as ContentDbRow[]).map(mapContentRow);
    void publishedContent;
    const publishedTotal = publishedCountRes.count ?? 0;
    const draftTotal = draftCountRes.count ?? 0;
    const savedTotal = savedCountRes.count ?? 0;
    const followedTotal = followsCountRes.count ?? 0;

    const advertisers = ((advertiserRes.data ?? []) as unknown as { id: string; ad_campaigns: CampaignRow | CampaignRow[] | null }[]).flatMap(
        (a) => {
            if (!a.ad_campaigns) return [];
            return Array.isArray(a.ad_campaigns) ? a.ad_campaigns : [a.ad_campaigns];
        },
    );
    const activeCampaigns = advertisers.filter((c) => c.status === "active");
    const pendingCampaigns = advertisers.filter((c) => c.status === "pending");
    const totalSpend = advertisers.reduce((sum, c) => {
        const n = typeof c.agreed_price === "string" ? Number(c.agreed_price) : (c.agreed_price ?? 0);
        return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    const profileInitial = {
        displayName: profile?.display_name ?? "",
        fullName: profile?.full_name ?? "",
        bio: profile?.bio ?? "",
    };

    const isAdmin = roles.includes("admin");
    const isEditor = roles.includes("editor");
    const isAdvertiser = roles.includes("advertiser");
    const isContributor = roles.includes("contributor");
    const isStaff = isAdmin || isEditor;

    const formattedDate = (value: string | null | undefined) =>
        value ? new Date(value).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB") : t.submittedRecently;

    const submissionTitle = (s: SubmissionRow) =>
        s.submission_type ? localizeType(s.submission_type, common) : t.statSubmissions;

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
                                <RoleBadge key={role} role={role} copy={t} />
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
                        <div className="flex flex-wrap gap-2">
                            {roles.map((role) => (
                                <RoleBadge key={role} role={role} copy={t} />
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardCard label={t.statCampaigns} value={String(activeCampaigns.length)} hint={t.hintActiveMonth} />
                    <DashboardCard label={t.statReach} value={String(pendingCampaigns.length)} hint={t.hintImpressions} />
                    <DashboardCard label={t.statClicks} value={String(advertisers.length)} hint={t.hintEngagement} />
                    <DashboardCard label={t.statSpend} value={formatXaf(totalSpend, t)} hint={t.hintBudget} />
                </section>

                {advertisers.length === 0 ? (
                    <EmptyState message={t.noCampaigns} action={<ActionLink href={p("/advertise")} label={t.linkCreateCampaign} />} />
                ) : (
                    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">{t.quickActions}</h2>
                            <Link href={p("/advertise")} className="text-xs font-medium text-primary hover:underline">
                                {t.viewAll}
                            </Link>
                        </div>
                        <div className="mt-5 space-y-3">
                            {advertisers.slice(0, 5).map((c) => (
                                <ActivityRow
                                    key={c.id}
                                    title={c.name}
                                    meta={localizeStatus(c.status, common)}
                                    status={c.status}
                                    fallback={t.pending}
                                    common={common}
                                />
                            ))}
                        </div>
                    </section>
                )}

                <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <h2 className="text-xl font-semibold">{t.quickActions}</h2>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <Link href={p("/advertise")} className="rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium transition hover:bg-muted">
                            {t.linkCreateCampaign}
                        </Link>
                        <Link href={p("/advertise")} className="rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium transition hover:bg-muted">
                            {t.linkExplorePages}
                        </Link>
                        <Link href={p("/")} className="rounded-xl border border-border bg-muted/20 p-4 text-sm font-medium transition hover:bg-muted">
                            {t.linkExploreCommunity}
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
                        <div className="flex flex-wrap gap-2">
                            {roles.map((role) => (
                                <RoleBadge key={role} role={role} copy={t} />
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardCard label={t.statSubmissions} value={String(submissionsTotal)} hint={t.hintRecent} />
                    <DashboardCard
                        label={t.statPublished}
                        value={String(publishedTotal)}
                        hint={t.hintLiveStories}
                    />
                    <DashboardCard
                        label={t.statDrafts}
                        value={String(draftTotal)}
                        hint={t.hintInProgress}
                    />
                    <DashboardCard label={t.statProfile} value={t.member} hint={t.hintContributor} />
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">{t.recentSubmissions}</h2>
                            {submissionsTotal > submissions.length && (
                                <Link href={p("/account/submissions")} className="text-xs font-medium text-primary hover:underline">
                                    {t.viewAll}
                                </Link>
                            )}
                        </div>
                        <div className="mt-5 space-y-3">
                            {submissions.length === 0 ? (
                                <EmptyState
                                    message={t.emptySubmissions}
                                    action={<ActionLink href={p("/submit")} label={t.linkSubmit} />}
                                />
                            ) : (
                                submissions.map((submission) => (
                                    <ActivityRow
                                        key={submission.id}
                                        title={submissionTitle(submission)}
                                        meta={formattedDate(submission.submitted_at)}
                                        status={submission.status}
                                        fallback={t.pending}
                                        common={common}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <h2 className="text-xl font-semibold">{t.contributorTools}</h2>
                        <div className="mt-5 space-y-3">
                            <ActionLink href={p("/submit")} label={t.linkSubmit} />
                            <ActionLink href={p("/account/listings")} label={dict.buySell.myListings} />
                            <ActionLink href={p("/contributors")} label={t.linkBrowseContributors} />
                            <ActionLink href={p("/")} label={t.linkExploreCommunity} />
                            <ProfileEditDialog copy={t} common={common} initial={profileInitial} />
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
                    <div className="flex flex-wrap gap-2">
                        {roles.length > 0 ? (
                            roles.map((role) => <RoleBadge key={role} role={role} copy={t} />)
                        ) : (
                            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                                {t.member}
                            </span>
                        )}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardCard label={t.statSubmissions} value={String(submissionsTotal)} hint={t.hintRecent} />
                <DashboardCard label={t.statSaved} value={String(savedTotal)} hint={t.hintBookmarks} />
                <DashboardCard label={t.statFollowed} value={String(followedTotal)} hint={t.hintFollows} />
                <DashboardCard label={t.statAccess} value={t.member} hint={t.hintStandard} />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold">{t.recentActivity}</h2>
                        {submissionsTotal > submissions.length && (
                            <Link href={p("/account/submissions")} className="text-xs font-medium text-primary hover:underline">
                                {t.viewAll}
                            </Link>
                        )}
                    </div>
                    <div className="mt-5 space-y-3">
                        {submissions.length === 0 ? (
                            <EmptyState
                                message={t.emptyActivity}
                                action={<ActionLink href={p("/submit")} label={t.linkSubmit} />}
                            />
                        ) : (
                            submissions.map((submission) => (
                                <ActivityRow
                                    key={submission.id}
                                    title={submissionTitle(submission)}
                                    meta={formattedDate(submission.submitted_at)}
                                    status={submission.status}
                                    fallback={t.pending}
                                    common={common}
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
                        <ProfileEditDialog copy={t} common={common} initial={profileInitial} />
                    </div>
                </div>
            </section>
        </div>
    );
}

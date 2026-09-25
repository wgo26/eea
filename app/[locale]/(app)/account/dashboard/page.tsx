import Link from "next/link";
import {
    Bell,
    Bookmark,
    Eye,
    Megaphone,
    PenLine,
    Send,
    ShoppingCart,
    UserRound,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { getDictionary, type Dictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { getDashboardStats } from "@/lib/admin/queries";
import { requireUser } from "@/lib/auth/guards";
import { getAccountIdentity } from "@/lib/account/identity";
import { localizeStatus, localizeType } from "@/lib/admin/labels";
import {
    AccountActionTile,
    AccountBadge,
    AccountCard,
    AccountEmptyState,
} from "@/components/account/account-page-shell";
import { MemberBanner } from "@/components/account/member-banner";
import { OnboardingCard } from "@/components/account/onboarding-card";

export async function generateMetadata(): Promise<{ title: string }> {
    const locale = await getRequestLocale();
    return { title: getDictionary(locale).account.topbar.dashboard };
}

type SubmissionRow = {
    id: string;
    status: string | null;
    submission_type?: string | null;
    submitted_at?: string | null;
    payload?: Record<string, string> | null;
};

type CampaignRow = {
    id: string;
    name: string;
    status: string | null;
    agreed_price: number | string | null;
    currency: string | null;
    impressions_count?: number | string | null;
    clicks_count?: number | string | null;
};

type Copy = Dictionary["account"]["dashboard"];

/**
 * Metric tile (Account audit §3 Phase 2): icon anchor, value, hint, and a
 * lift when it links somewhere — so a number is always a way in.
 */
function MetricCard({
    icon: Icon,
    label,
    value,
    hint,
    href,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: string;
    hint: string;
    href?: string;
}) {
    const body = (
        <>
            <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </>
    );
    const cls =
        "rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md";
    if (href) {
        return (
            <Link href={href} className={cls}>
                {body}
            </Link>
        );
    }
    return <div className={cls}>{body}</div>;
}

/** Status tone for the unified pill (mirrors the stageForStatus buckets). */
function statusTone(status: string | null): "neutral" | "primary" | "success" | "warning" | "danger" {
    switch (status) {
        case "published":
        case "approved":
            return "success";
        case "rejected":
        case "withdrawn":
            return "danger";
        case "in_review":
        case "needs_clarification":
        case "editorial_review":
            return "warning";
        case "pending":
        case "automated_checks":
            return "primary";
        default:
            return "neutral";
    }
}

function ActivityRow({
    title,
    meta,
    status,
    fallback,
    common,
    href,
}: {
    title: string;
    meta: string;
    status: string | null;
    fallback: string;
    common: Dictionary["admin"]["common"];
    href?: string;
}) {
    const inner = (
        <>
            <div className="min-w-0">
                <p className="truncate font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{meta}</p>
            </div>
            <AccountBadge tone={statusTone(status)} className="shrink-0">
                {status ? localizeStatus(status, common) : fallback}
            </AccountBadge>
        </>
    );
    const cls =
        "flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-3" +
        (href ? " transition-colors hover:bg-accent" : "");
    if (href) {
        return (
            <Link href={href} className={cls}>
                {inner}
            </Link>
        );
    }
    return <div className={cls}>{inner}</div>;
}

function formatXaf(value: number | string | null, copy: Copy): string {
    const n = typeof value === "string" ? Number(value) : (value ?? 0);
    if (!Number.isFinite(n) || n === 0) return copy.statSpendXaf.replace("{amount}", "0");
    return copy.statSpendXaf.replace("{amount}", Math.round(n).toLocaleString());
}

/** Shared page frame — the layout owns `<main>`, this only sets the rhythm. */
function DashboardFrame({ children }: { children: ReactNode }) {
    return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-6 lg:py-10">{children}</div>;
}

const num = (v: number | string | null | undefined) => {
    const n = typeof v === "string" ? Number(v) : (v ?? 0);
    return Number.isFinite(n) ? n : 0;
};

export default async function Page() {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const t: Copy = dict.account.dashboard;
    const e = dict.account.empty;
    const common = dict.admin.common;
    const p = (path: string) => localePath(locale, path);

    const { supabase, user } = await requireUser("/account/dashboard");
    const identity = await getAccountIdentity(user, locale);

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

    const [
        submissionsRes,
        submissionsCountRes,
        savedCountRes,
        followsCountRes,
        publishedCountRes,
        advertiserRes,
        impactRes,
        listingsCountRes,
    ] = await Promise.all([
        applySubmissionScope(
            supabase
                .from("submissions")
                .select("id, status, submission_type, submitted_at, payload", { count: "exact" })
                .order("submitted_at", { ascending: false }),
        ).limit(5),
        applySubmissionScope(
            supabase.from("submissions").select("id", { count: "exact", head: true }),
        ),
        supabase.from("saved_content").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("content_follows").select("user_id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
            .from("content_items")
            .select("id", { count: "exact", head: true })
            .eq("author_id", user.id)
            .eq("status", "published"),
        // Advertiser stats: own campaigns via advertisers.user_id (RLS allows).
        supabase
            .from("advertisers")
            .select("id, ad_campaigns(id, name, status, agreed_price, currency, impressions_count, clicks_count)")
            .eq("user_id", user.id),
        // Contributor impact: view/share totals over own published items.
        // Capped at 5000 rows; beyond that the number is a lower bound.
        supabase
            .from("content_items")
            .select("view_count, share_count")
            .eq("author_id", user.id)
            .eq("status", "published")
            .limit(5000),
        supabase
            .from("content_items")
            .select("id", { count: "exact", head: true })
            .eq("submitted_by", user.id)
            .eq("type", "listing"),
    ]);

    const submissions = (submissionsRes.data ?? []) as SubmissionRow[];
    const submissionsTotal = submissionsCountRes.count ?? submissions.length;
    const savedTotal = savedCountRes.count ?? 0;
    const followedTotal = followsCountRes.count ?? 0;
    const publishedTotal = publishedCountRes.count ?? 0;
    const listingsTotal = listingsCountRes.count ?? 0;
    const totalViews = ((impactRes.data ?? []) as { view_count?: number | string | null }[]).reduce(
        (s, r) => s + num(r.view_count),
        0,
    );
    const totalShares = ((impactRes.data ?? []) as { share_count?: number | string | null }[]).reduce(
        (s, r) => s + num(r.share_count),
        0,
    );

    const advertisers = ((advertiserRes.data ?? []) as unknown as {
        id: string;
        ad_campaigns: CampaignRow | CampaignRow[] | null;
    }[]).flatMap((a) => (a.ad_campaigns ? (Array.isArray(a.ad_campaigns) ? a.ad_campaigns : [a.ad_campaigns]) : []));
    const activeCampaigns = advertisers.filter((c) => c.status === "active");
    const totalSpend = advertisers.reduce((sum, c) => sum + num(c.agreed_price), 0);
    const totalImpressions = advertisers.reduce((s, c) => s + num(c.impressions_count), 0);
    const totalClicks = advertisers.reduce((s, c) => s + num(c.clicks_count), 0);

    const roles = identity.roles;
    const isStaff = identity.isStaff;
    const isAdmin = roles.includes("admin");
    const isAdvertiser = roles.includes("advertiser");
    const isContributor = roles.includes("contributor");

    const formattedDate = (value: string | null | undefined) =>
        value ? new Date(value).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB") : t.submittedRecently;

    const submissionTitle = (s: SubmissionRow) =>
        s.payload?.headline ||
        s.payload?.item ||
        s.payload?.what ||
        (s.submission_type ? localizeType(s.submission_type, common) : t.statSubmissions);

    const nf = (v: number) => v.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB");

    /* ------------------------------------------------ staff variant --- */
    if (isStaff) {
        const stats = await getDashboardStats();
        return (
            <DashboardFrame>
                <OnboardingCard locale={locale} dict={dict} />
                <MemberBanner
                    locale={locale}
                    identity={identity}
                    kicker={t.staffKicker}
                    subtitle={isAdmin ? t.adminAccess : t.editorAccess}
                />

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={Send} label={t.statPending} value={String(stats.pendingSubmissions)} hint={t.hintAwaitingReview} href={p("/admin/moderation")} />
                    <MetricCard icon={Eye} label={t.statPublishedToday} value={String(stats.publishedToday)} hint={t.hintLive} href={p("/admin/content")} />
                    <MetricCard icon={Bell} label={t.statScheduled} value={String(stats.scheduled)} hint={t.hintFuture} href={p("/admin/content")} />
                    <MetricCard icon={Megaphone} label={t.statActiveAds} value={String(stats.activeAds)} hint={t.hintCampaigns} href={p("/admin/ads")} />
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <AccountCard title={t.operations}>
                        <div className="space-y-2">
                            <AccountActionTile href={p("/admin/dashboard")} icon={Eye} label={t.linkAdminDashboard} />
                            <AccountActionTile href={p("/admin/moderation")} icon={Send} label={t.linkModeration} hint={t.hintAwaitingReview} />
                            <AccountActionTile href={p("/admin/content")} icon={PenLine} label={t.linkContentLibrary} />
                            {isAdmin ? <AccountActionTile href={p("/admin/users")} icon={UserRound} label={t.linkUserRoles} /> : null}
                        </div>
                    </AccountCard>

                    <AccountCard title={t.editorialSnapshot}>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>{t.statPending}: {stats.pendingSubmissions}</p>
                            <p>{t.statDrafts}: {stats.draftCount}</p>
                            <p>{dict.admin.dashboard.photoStories}: {stats.totalStories}</p>
                            <p>{dict.admin.dashboard.communityNews}: {stats.totalNews}</p>
                            <p>{dict.admin.dashboard.buySell}: {stats.totalListings}</p>
                        </div>
                        <div className="mt-4">
                            <AccountActionTile href={p("/account/profile")} icon={UserRound} label={dict.account.profile.title} />
                        </div>
                    </AccountCard>
                </section>
            </DashboardFrame>
        );
    }

    /* -------------------------------------------- advertiser variant --- */
    if (isAdvertiser) {
        return (
            <DashboardFrame>
                <OnboardingCard locale={locale} dict={dict} />
                <MemberBanner locale={locale} identity={identity} kicker={t.advertiserKicker} subtitle={t.advertiserSubtitle} />

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={Megaphone} label={t.statCampaigns} value={String(activeCampaigns.length)} hint={t.hintActiveMonth} href={p("/advertise")} />
                    <MetricCard icon={Eye} label={t.statReach} value={nf(totalImpressions)} hint={t.hintImpressions} />
                    <MetricCard icon={Send} label={t.statClicks} value={nf(totalClicks)} hint={t.hintEngagement} />
                    <MetricCard icon={Bookmark} label={t.statSpend} value={formatXaf(totalSpend, t)} hint={t.hintBudget} />
                </section>

                {advertisers.length === 0 ? (
                    <AccountEmptyState
                        icon={Megaphone}
                        title={t.noCampaigns}
                        body={dict.advertise.tagline}
                        actionLabel={t.linkCreateCampaign}
                        actionHref={p("/advertise")}
                    />
                ) : (
                    <AccountCard
                        title={t.recentActivity}
                        action={
                            <Link href={p("/advertise")} className="text-xs font-medium text-primary hover:underline">
                                {t.viewAll}
                            </Link>
                        }
                    >
                        <div className="space-y-2">
                            {advertisers.slice(0, 5).map((c) => (
                                <ActivityRow
                                    key={c.id}
                                    title={c.name}
                                    meta={c.status ? localizeStatus(c.status, common) : t.pending}
                                    status={c.status}
                                    fallback={t.pending}
                                    common={common}
                                />
                            ))}
                        </div>
                    </AccountCard>
                )}

                <AccountCard title={t.quickActions}>
                    <div className="grid gap-3 md:grid-cols-3">
                        <AccountActionTile href={p("/advertise")} icon={Megaphone} label={t.linkCreateCampaign} />
                        <AccountActionTile href={p("/advertise")} icon={Eye} label={t.linkExplorePages} />
                        <AccountActionTile href={p("/")} icon={UserRound} label={t.linkExploreCommunity} />
                    </div>
                </AccountCard>
            </DashboardFrame>
        );
    }
    /* ------------------------------------------ contributor variant --- */
    if (isContributor) {
        return (
            <DashboardFrame>
                <OnboardingCard locale={locale} dict={dict} />
                <MemberBanner
                    locale={locale}
                    identity={identity}
                    kicker={t.contributorKicker}
                    subtitle={t.contributorSubtitle}
                    profileTab="identity"
                />

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={Send} label={t.statSubmissions} value={String(submissionsTotal)} hint={t.hintRecent} href={p("/account/submissions")} />
                    <MetricCard icon={Eye} label={t.statPublished} value={String(publishedTotal)} hint={t.hintLiveStories} />
                    <MetricCard icon={Bookmark} label={t.statViews} value={nf(totalViews)} hint={t.hintViews} />
                    <MetricCard icon={Bell} label={t.statShares} value={nf(totalShares)} hint={t.hintShares} />
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <AccountCard
                        title={t.recentSubmissions}
                        action={
                            submissionsTotal > submissions.length ? (
                                <Link href={p("/account/submissions")} className="text-xs font-medium text-primary hover:underline">
                                    {t.viewAll}
                                </Link>
                            ) : null
                        }
                    >
                        {submissions.length === 0 ? (
                            <AccountEmptyState
                                icon={PenLine}
                                title={e.submissionsTitle}
                                body={e.submissionsBody}
                                actionLabel={e.submissionsCta}
                                actionHref={p("/submit")}
                            />
                        ) : (
                            <div className="space-y-2">
                                {submissions.map((submission) => (
                                    <ActivityRow
                                        key={submission.id}
                                        title={submissionTitle(submission)}
                                        meta={formattedDate(submission.submitted_at)}
                                        status={submission.status}
                                        fallback={t.pending}
                                        common={common}
                                        href={p("/account/submissions")}
                                    />
                                ))}
                            </div>
                        )}
                    </AccountCard>

                    <AccountCard title={t.quickActions}>
                        <div className="space-y-2">
                            <AccountActionTile href={p("/submit")} icon={PenLine} label={t.linkSubmit} />
                            <AccountActionTile href={p("/account/profile")} icon={UserRound} label={dict.account.profile.title} />
                            <AccountActionTile href={p("/account/listings")} icon={ShoppingCart} label={dict.buySell.myListings} />
                            <AccountActionTile href={p("/account/notifications")} icon={Bell} label={dict.account.topbar.notifications} />
                            {identity.publicProfileHref ? (
                                <AccountActionTile href={identity.publicProfileHref} icon={Eye} label={dict.account.profile.viewPublic} />
                            ) : null}
                        </div>
                    </AccountCard>
                </section>
            </DashboardFrame>
        );
    }

    /* ------------------------------------------------ member variant --- */
    return (
        <DashboardFrame>
            <OnboardingCard locale={locale} dict={dict} />
            <MemberBanner locale={locale} identity={identity} kicker={t.memberKicker} subtitle={t.memberSubtitle} />

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Send} label={t.statSubmissions} value={String(submissionsTotal)} hint={t.hintRecent} href={p("/account/submissions")} />
                <MetricCard icon={Bookmark} label={t.statSaved} value={String(savedTotal)} hint={t.hintBookmarks} href={p("/account/saved")} />
                <MetricCard icon={Bell} label={t.statFollowed} value={String(followedTotal)} hint={t.hintFollows} href={p("/account/follows")} />
                <MetricCard icon={ShoppingCart} label={dict.buySell.myListings} value={String(listingsTotal)} hint={dict.buySell.myListingsBody} href={p("/account/listings")} />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <AccountCard
                    title={t.recentActivity}
                    action={
                        submissionsTotal > submissions.length ? (
                            <Link href={p("/account/submissions")} className="text-xs font-medium text-primary hover:underline">
                                {t.viewAll}
                            </Link>
                        ) : null
                    }
                >
                    {submissions.length === 0 ? (
                        <AccountEmptyState
                            icon={PenLine}
                            title={e.submissionsTitle}
                            body={e.submissionsBody}
                            actionLabel={e.submissionsCta}
                            actionHref={p("/submit")}
                            secondaryLabel={t.linkExploreHome}
                            secondaryHref={p("/")}
                        />
                    ) : (
                        <div className="space-y-2">
                            {submissions.map((submission) => (
                                <ActivityRow
                                    key={submission.id}
                                    title={submissionTitle(submission)}
                                    meta={formattedDate(submission.submitted_at)}
                                    status={submission.status}
                                    fallback={t.pending}
                                    common={common}
                                    href={p("/account/submissions")}
                                />
                            ))}
                        </div>
                    )}
                </AccountCard>

                <AccountCard title={t.recommendedActions}>
                    <div className="space-y-2">
                        <AccountActionTile href={p("/submit")} icon={PenLine} label={t.linkSubmit} />
                        <AccountActionTile href={p("/account/saved")} icon={Bookmark} label={dict.account.saved.title} />
                        <AccountActionTile href={p("/account/notifications")} icon={Bell} label={dict.account.notifications.title} />
                        <AccountActionTile href={p("/")} icon={UserRound} label={t.linkExploreHome} />
                    </div>
                </AccountCard>
            </section>
        </DashboardFrame>
    );
}


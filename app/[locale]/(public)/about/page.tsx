import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import {
    ArrowRight,
    BadgeCheck,
    BookOpen,
    Copyright,
    FileText,
    Globe,
    Mail,
    Scale,
    ShieldCheck,
    Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    formatDate,
    getDictionary,
    resolveLocale,
    type Dictionary,
    type Locale,
} from "@/lib/i18n";
import { getCommunityStats, type CommunityStats } from "@/lib/queries/about";
import { getCorrectionRegister, type RegisterEntry } from "@/lib/queries/corrections";
import { getAboutOverrides } from "@/lib/admin/queries";
import { formatMoneyCompact } from "@/lib/format";
import { ApertureMark } from "@/components/system/page-skeletons";

/**
 * A3 — ISR: editorial content, revalidated every 5 minutes (or on demand).
 * The literal is required: segment config must be statically analyzable.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return {
        title: dict.about.title,
        description: dict.about.tagline,
        alternates: buildAlternates(locale, "/about"),
    };
}

const POLICY_LINKS = [
    { href: "/about/terms", labelKey: "terms", descKey: "termsDesc", icon: FileText },
    { href: "/about/privacy", labelKey: "privacy", descKey: "privacyDesc", icon: ShieldCheck },
    { href: "/about/guidelines", labelKey: "guidelines", descKey: "guidelinesDesc", icon: Scale },
    { href: "/about/copyright", labelKey: "copyright", descKey: "copyrightDesc", icon: Copyright },
    { href: "/about/contact", labelKey: "contact", descKey: "contactDesc", icon: Mail },
] as const;

const PIPELINE_STEPS = [
    { titleKey: "pipeSubmitted", bodyKey: "pipeSubmittedBody", icon: Users },
    { titleKey: "pipeReview", bodyKey: "pipeReviewBody", icon: BookOpen },
    { titleKey: "pipeVerified", bodyKey: "pipeVerifiedBody", icon: BadgeCheck },
    { titleKey: "pipePublished", bodyKey: "pipePublishedBody", icon: Globe },
] as const;

const VALUES = [
    { titleKey: "vCommunityTitle", bodyKey: "vCommunityBody", icon: Users },
    { titleKey: "vVerifiedTitle", bodyKey: "vVerifiedBody", icon: ShieldCheck },
    { titleKey: "vCreditTitle", bodyKey: "vCreditBody", icon: BadgeCheck },
    { titleKey: "vOpenTitle", bodyKey: "vOpenBody", icon: BookOpen },
] as const;

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const a = dict.about;
    // The register preview is the record demonstrating itself: the three most
    // recent published corrections, live. Nothing renders when there are none.
    const [stats, overrides, recentCorrections] = await Promise.all([
        getCommunityStats(),
        getAboutOverrides(locale),
        getCorrectionRegister({ limit: 3, locale }),
    ]);
    // Admin overrides (managed at /admin/policies → About page) win over the
    // dictionary; empty table = built-in copy renders, never a blank.
    const text = (key: keyof typeof overrides, field: "heading" | "body" | "ctaLabel", fallback: string) =>
        overrides[key]?.[field]?.trim() || fallback;
    const heroTitle = text("hero", "heading", a.heroTitle);
    const heroBody = text("hero", "body", a.heroBody);
    const statsTitle = text("stats", "heading", a.statsTitle);
    const statsHint = text("stats", "body", a.statsHint);
    const pipelineTitle = text("pipeline", "heading", a.pipelineTitle);
    const pipelineHint = text("pipeline", "body", a.pipelineHint);
    const valuesTitle = text("values", "heading", a.valuesTitle);
    const charterTitle = text("charter", "heading", a.charterTitle);
    const charterHint = text("charter", "body", a.charterHint);
    const closingTitle = text("closing", "heading", a.closingTitle);
    const closingBody = text("closing", "body", a.closingBody);
    const closingCta = text("closing", "ctaLabel", a.closingCta);

    return (
        <div className="mx-auto w-full max-w-6xl space-y-16 px-4 py-10 md:px-6 md:py-14">
            {/* ------------------------------------------------ Hero — the eye */}
            <section className="relative overflow-hidden rounded-[2rem] bg-foreground px-6 py-14 text-background md:px-12 md:py-20">
                {/* Aperture rings — the brand motif, oversized and cropped */}
                <ApertureMark className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 opacity-20" />
                <ApertureMark className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 opacity-10" />

                <div className="relative max-w-2xl">
                    <p className="flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.28em] text-primary">
                        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-primary" />
                        {a.heroKicker}
                    </p>
                    <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
                        {heroTitle}
                    </h1>
                    <p className="mt-6 max-w-xl text-base leading-relaxed opacity-80 md:text-lg">
                        {heroBody}
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Button render={<Link href={localePath(locale, "/submit")} />} size="lg">
                            {a.ctaSubmit}
                            <ArrowRight aria-hidden />
                        </Button>
                        <Button render={<Link href={localePath(locale, "/photo-stories")} />} size="lg" variant="secondary">
                            {a.ctaExplore}
                        </Button>
                    </div>
                    {/* Third way in — a record you can look things up in, and
                        see how it handles being wrong. */}
                    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold">
                        <Link
                            href={localePath(locale, "/about/guide")}
                            className="underline decoration-primary/60 underline-offset-4 hover:decoration-primary"
                        >
                            {a.guideTitle}
                        </Link>
                        <Link
                            href={localePath(locale, "/search")}
                            className="underline decoration-primary/60 underline-offset-4 hover:decoration-primary"
                        >
                            {a.ctaSearch}
                        </Link>
                        <Link
                            href={localePath(locale, "/about/corrections")}
                            className="underline decoration-primary/60 underline-offset-4 hover:decoration-primary"
                        >
                            {a.correctionsViewRegister}
                        </Link>
                    </div>
                </div>
            </section>

            {/* ------------------------------------- Live proof band (DB-fed) */}
            <section className="rounded-[2rem] border bg-muted/40 p-8 md:p-10">
                <header>
                    <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">{statsTitle}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{statsHint}</p>
                </header>
                <div className="mt-8 grid grid-cols-2 gap-8 lg:grid-cols-4">
                    <StatBlock value={stats.storiesPublished.toLocaleString()} label={a.statStories} accent />
                    <StatBlock value={stats.contributors.toLocaleString()} label={a.statContributors} />
                    <StatBlock value={stats.locationsCovered.toLocaleString()} label={a.statLocations} />
                    <StatBlock
                        value={stats.correctionsPublished30d.toLocaleString()}
                        label={a.accountabilityCorrections}
                        accent
                    />
                </div>
                {stats.raisedHeadlineCurrency ? (
                    <p className="mt-8 border-t border-border/60 pt-5 text-sm text-muted-foreground">
                        <span className="font-bold text-foreground">
                            {formatMoneyCompact(stats.raisedHeadlineTotal, stats.raisedHeadlineCurrency, locale)}
                        </span>{" "}
                        {raisedFootnote(stats, a, locale)}
                    </p>
                ) : null}
            </section>

            {/* ------------------------------------------ The accountable record */}
            <section>
                <header className="max-w-2xl">
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                        {a.accountabilityTitle}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                        {a.accountabilityHint}
                    </p>
                </header>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {/* The accountability number AND its three most recent
                        instances — the proof band counts it, this panel shows
                        what the count is made of. When the loop has not been
                        walked yet, the count is 0 and the list is empty state
                        instead of a gap in the argument. */}
                    <Link
                        href={localePath(locale, "/about/corrections")}
                        className="group flex flex-col rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
                    >
                        <span className="text-4xl font-extrabold tabular-nums tracking-tight text-primary">
                            {stats.correctionsPublished30d.toLocaleString()}
                        </span>
                        <span className="mt-1 text-sm font-extrabold">
                            {a.accountabilityCorrections}
                        </span>
                        <span className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            {a.accountabilityCorrectionsBody}
                        </span>
                        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                            {a.correctionsViewRegister}
                            <ArrowRight
                                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                                aria-hidden
                            />
                        </span>
                    </Link>
                    <LiveCorrections corrections={recentCorrections} dict={dict} locale={locale} />
                </div>
            </section>

            {/* ----------------------------- Trust pipeline: sighting → story */}
            <section>
                <header className="max-w-2xl">
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{pipelineTitle}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                        {pipelineHint}
                    </p>
                </header>
                <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {PIPELINE_STEPS.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <li key={step.titleKey} className="relative rounded-2xl border bg-card p-5">
                                <span className="absolute right-4 top-4 text-xs font-black text-primary/60">
                                    0{index + 1}
                                </span>
                                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Icon className="h-5 w-5" aria-hidden />
                                </span>
                                <h3 className="mt-4 text-sm font-extrabold">{a[step.titleKey]}</h3>
                                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                    {a[step.bodyKey]}
                                </p>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* ------------------------------------------------------ Values */}
            <section>
                <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{valuesTitle}</h2>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    {VALUES.map((value) => {
                        const Icon = value.icon;
                        return (
                            <div key={value.titleKey} className="flex gap-4 rounded-2xl border bg-card p-5">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                                    <Icon className="h-5 w-5" aria-hidden />
                                </span>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-extrabold">{a[value.titleKey]}</h3>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                        {a[value.bodyKey]}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ---------------------------------- Charter (policies, upgraded) */}
            <section>
                <header className="max-w-2xl">
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{charterTitle}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                        {charterHint}
                    </p>
                </header>
                <div className="mt-8 grid gap-3">
                    {POLICY_LINKS.map((link) => {
                        const Icon = link.icon;
                        const label = dict.footer[link.labelKey];
                        return (
                            <Link
                                key={link.href}
                                href={localePath(locale, link.href)}
                                className="group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Icon className="h-5 w-5" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-bold">{label}</span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground md:text-sm">
                                        {a[link.descKey]}
                                    </span>
                                </span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                            </Link>
                        );
                    })}
                </div>
            </section>

            {/* ------------------------------------------------- Closing CTA */}
            <section className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-primary-foreground md:px-12 md:py-16">
                <ApertureMark className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 opacity-20" />
                <div className="relative max-w-xl">
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-4xl">{closingTitle}</h2>
                    <p className="mt-3 text-sm font-medium leading-relaxed opacity-90 md:text-base">
                        {closingBody}
                    </p>
                    <Button
                        render={<Link href={localePath(locale, "/submit")} />}
                        size="lg"
                        variant="secondary"
                        className="mt-6"
                    >
                        {closingCta}
                        <ArrowRight aria-hidden />
                    </Button>
                </div>
            </section>
        </div>
    );
}

/**
 * The three most recent published corrections, live on the About page: the
 * record demonstrating itself instead of asserting itself. Each row links to
 * the fixed story when one exists. Empty state explains what an empty
 * register means (not yet, not never) instead of hiding the panel.
 */
function LiveCorrections({
    corrections,
    dict,
    locale,
}: {
    corrections: RegisterEntry[];
    dict: Dictionary;
    locale: Locale;
}) {
    const c = dict.about;
    return (
        <div className="rounded-2xl border bg-card p-5">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                {c.correctionsTitle}
            </p>
            {corrections.length === 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {c.correctionsEmptyBody}
                </p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {corrections.map((entry) => (
                        <li key={entry.id} className="text-sm">
                            <span className="block font-bold tabular-nums text-muted-foreground">
                                {entry.resolvedAt ? formatDate(entry.resolvedAt, locale) : null}
                            </span>
                            {entry.contentHref ? (
                                <Link
                                    href={localePath(locale, entry.contentHref)}
                                    className="font-bold hover:underline"
                                >
                                    {entry.contentTitle || c.correctionsStoryLabel}
                                </Link>
                            ) : (
                                <span className="font-bold">
                                    {entry.contentTitle || c.correctionsStoryLabel}
                                </span>
                            )}
                            <span className="mt-0.5 line-clamp-2 block text-muted-foreground">
                                {entry.resolution || entry.correctionText}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <Link
                href={localePath(locale, "/about/corrections")}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
                {c.correctionsViewRegister}
                <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
        </div>
    );
}

/**
 * The raised-funds footnote. Totals are never fused across currencies, so the
 * line names every bucket once the RPC returns it — "1.25M FCFA · €3 200"
 * carries its own evidence. One bucket: just that. None: nothing renders.
 */
function raisedFootnote(stats: CommunityStats, a: Dictionary["about"], locale: Locale): string {
    const parts = stats.raisedByCurrency.map((row) =>
        formatMoneyCompact(row.total, row.currency, locale),
    );
    return `${a.statRaised}: ${parts.join(" · ")}`;
}

function StatBlock({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
    return (
        <div className="min-w-0">
            <p
                className={`truncate text-3xl font-extrabold tabular-nums tracking-tight md:text-4xl ${
                    accent ? "text-primary" : "text-foreground"
                }`}
            >
                {value}
            </p>
            <p className="mt-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
        </div>
    );
}

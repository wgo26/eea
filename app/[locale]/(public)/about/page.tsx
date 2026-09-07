import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { headers } from "next/headers";
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
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getCommunityStats } from "@/lib/queries/about";
import { getAboutOverrides } from "@/lib/admin/queries";
import { formatMoneyCompact } from "@/lib/format";
import { ApertureMark } from "@/components/system/page-skeletons";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
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

const LOOP_STEPS = [
    "stepDiscover",
    "stepRead",
    "stepParticipate",
    "stepSubmit",
    "stepVerify",
    "stepPublish",
    "stepShare",
    "stepReturn",
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

export default async function AboutPage() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    const a = dict.about;
    const [stats, overrides] = await Promise.all([getCommunityStats(), getAboutOverrides(locale)]);
    // Admin overrides (managed at /admin/policies → About page) win over the
    // dictionary; empty table = built-in copy renders, never a blank.
    const text = (key: keyof typeof overrides, field: "heading" | "body" | "ctaLabel", fallback: string) =>
        overrides[key]?.[field]?.trim() || fallback;
    const heroTitle = text("hero", "heading", a.heroTitle);
    const heroBody = text("hero", "body", a.heroBody);
    const loopTitle = text("loop", "heading", a.loopTitle);
    const loopHint = text("loop", "body", a.loopHint);
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
                </div>
            </section>

            {/* --------------------------------- The core loop, as a journey */}
            <section>
                <header className="max-w-2xl">
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{loopTitle}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                        {loopHint}
                    </p>
                </header>
                <ol className="mt-8 flex snap-x gap-3 overflow-x-auto pb-4">
                    {LOOP_STEPS.map((key, index) => (
                        <li
                            key={key}
                            className="flex min-w-[9.5rem] snap-start flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-6 text-center"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                                {index + 1}
                            </span>
                            <span className="text-sm font-bold leading-tight">{a[key]}</span>
                        </li>
                    ))}
                </ol>
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
                    <StatBlock value={formatMoneyCompact(stats.raisedTotal, stats.raisedCurrency, locale)} label={a.statRaised} />
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
            <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:text-xs">
                {label}
            </p>
        </div>
    );
}

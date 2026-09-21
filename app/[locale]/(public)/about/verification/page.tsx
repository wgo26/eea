import type { Metadata } from "next";
import { Landmark, Radio, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { buildAlternates } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";

export const revalidate = 300;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return {
        title: dict.about.verificationTitle,
        description: dict.about.verificationIntro,
        alternates: buildAlternates(locale, "/about/verification"),
    };
}

const STATES: {
    key: string;
    icon: LucideIcon;
    titleKey: "verificationVerifiedTitle" | "verificationCommunityTitle" | "verificationOfficialTitle" | "verificationDevelopingTitle";
    bodyKey: "verificationVerifiedBody" | "verificationCommunityBody" | "verificationOfficialBody" | "verificationDevelopingBody";
    badgeClass: string;
}[] = [
    {
        key: "verified",
        icon: ShieldCheck,
        titleKey: "verificationVerifiedTitle",
        bodyKey: "verificationVerifiedBody",
        badgeClass: "bg-emerald-600/90 text-white",
    },
    {
        key: "community",
        icon: Users,
        titleKey: "verificationCommunityTitle",
        bodyKey: "verificationCommunityBody",
        badgeClass: "bg-white/85 text-neutral-900",
    },
    {
        key: "official",
        icon: Landmark,
        titleKey: "verificationOfficialTitle",
        bodyKey: "verificationOfficialBody",
        badgeClass: "bg-sky-600/90 text-white",
    },
    {
        key: "developing",
        icon: Radio,
        titleKey: "verificationDevelopingTitle",
        bodyKey: "verificationDevelopingBody",
        badgeClass: "bg-amber-400/90 text-neutral-900",
    },
];

/**
 * Phase 3 (U11) — the trust explainer every verification badge links to.
 * One card per trust state with the same icon + colour as the badge itself.
 */
export default async function VerificationAboutPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[
                    { label: dict.nav.about, path: "/about" },
                    { label: dict.about.verificationTitle },
                ]}
            />
            <header className="mt-6 max-w-3xl">
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                    {dict.about.verificationTitle}
                </h1>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {dict.about.verificationIntro}
                </p>
            </header>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
                {STATES.map((state) => (
                    <section
                        key={state.key}
                        className="rounded-2xl border border-border/70 bg-card p-5 shadow-card"
                    >
                        <p
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${state.badgeClass}`}
                        >
                            <state.icon className="h-3.5 w-3.5" aria-hidden />
                            {dict.about[state.titleKey]}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {dict.about[state.bodyKey]}
                        </p>
                    </section>
                ))}
            </div>
            <p className="mt-6 rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                {dict.about.verificationFooter}
            </p>
        </div>
    );
}

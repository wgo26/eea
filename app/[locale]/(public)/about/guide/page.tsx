import type { Metadata } from "next";
import Link from "next/link";
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    MapPin,
    Megaphone,
    Music,
    Newspaper,
    Search,
    Mail,
    ShieldCheck,
} from "lucide-react";

import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getPublicSiteSettings } from "@/lib/admin/queries/settings";
import { Button } from "@/components/ui/button";

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
        title: dict.about.guideTitle,
        description: dict.about.guideMetaDesc,
        alternates: buildAlternates(locale, "/about/guide"),
    };
}

/**
 * Community Guide — the newcomer manual. Every destination named here is a
 * real route (browse sections, submit flow, safety rules for notices and the
 * marketplace, advertise placements, help channels). No invented contact
 * details, no promised features: the contact form, the guidelines and the
 * correction register are the help surface.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    const g = dict.about;
    // Public contact channels (operator-configured at /admin/site-content).
    // Shown only when set — the guide never invents contact details.
    const channels = await getPublicSiteSettings();
    const waDigits = (channels.contactWhatsapp ?? "").replace(/\D/g, "");

    const sections = [
        { href: "/news", icon: Newspaper, title: dict.nav.news, body: g.guideNews },
        { href: "/photo-stories", icon: Camera, title: dict.nav.photoStories, body: g.guidePhotos },
        { href: "/culture", icon: Music, title: dict.nav.culture, body: g.guideCulture },
        { href: "/notices", icon: Megaphone, title: dict.nav.notices, body: g.guideNotices },
        { href: "/buy-sell", icon: ArrowRight, title: dict.nav.buySell, body: g.guideBuySell },
        { href: "/locations", icon: MapPin, title: dict.nav.locations, body: g.guidePlaces },
        { href: "/digest", icon: Mail, title: dict.nav.digest, body: g.guideDigest },
        { href: "/search", icon: Search, title: dict.nav.search, body: g.guideSearch },
    ];

    const rules = [
        { title: g.guideRulePrivacy, body: g.guideRulePrivacyBody },
        { title: g.guideRuleVerify, body: g.guideRuleVerifyBody },
        { title: g.guideRuleMeet, body: g.guideRuleMeetBody },
    ];

    const helpLinks = [
        { href: "/about/contact", label: g.guideHelpContact },
        { href: "/about/verification", label: g.guideHelpVerification },
        { href: "/about/corrections", label: g.guideHelpCorrections },
        { href: "/about/guidelines", label: g.guideHelpGuidelines },
    ];

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/about")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.about.back}
            </Link>
            <header className="mt-4 max-w-2xl">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{g.guideTitle}</h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{g.guideIntro}</p>
            </header>

            <h2 className="mb-4 mt-10 text-lg font-extrabold">{g.guideBrowseTitle}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
                {sections.map((s) => (
                    <Link
                        key={s.href}
                        href={localePath(locale, s.href)}
                        className="group flex items-start gap-4 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
                    >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <s.icon className="h-5 w-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="font-bold">{s.title}</span>
                            <span className="mt-1 block text-sm text-muted-foreground">{s.body}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                ))}
            </div>

            <section className="mt-10 rounded-2xl border bg-card p-5 md:p-6">
                <h2 className="text-lg font-extrabold">{g.guideSubmitTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{g.guideSubmitBody}</p>
                <Button render={<Link href={localePath(locale, "/submit")} />} className="mt-4">
                    {g.guideSubmitCta}
                </Button>
            </section>

            <section className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 md:p-6">
                <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
                    <ShieldCheck className="h-5 w-5 text-amber-600" aria-hidden />
                    {g.guideSafetyTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{g.guideSafetyIntro}</p>
                <ul className="mt-4 space-y-3">
                    {rules.map((r) => (
                        <li key={r.title} className="rounded-xl border bg-card p-4">
                            <p className="text-sm font-bold">{r.title}</p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-6 rounded-2xl border bg-card p-5 md:p-6">
                <h2 className="text-lg font-extrabold">{g.guideAdsTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{g.guideAdsBody}</p>
                <Button render={<Link href={localePath(locale, "/advertise")} />} variant="outline" className="mt-4">
                    {g.guideAdsCta}
                </Button>
            </section>

            <section className="mt-6 rounded-2xl border bg-muted/30 p-5 md:p-6">
                <h2 className="text-lg font-extrabold">{g.guideHelpTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{g.guideHelpBody}</p>
                {channels.contactEmail || waDigits ? (
                    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
                        {channels.contactEmail ? (
                            <a href={`mailto:${channels.contactEmail}`} className="text-primary hover:underline">
                                {g.guideHelpEmail}: {channels.contactEmail}
                            </a>
                        ) : null}
                        {waDigits ? (
                            <a
                                href={`https://wa.me/${waDigits}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                            >
                                {g.guideHelpWhatsapp}: {channels.contactWhatsapp}
                            </a>
                        ) : null}
                    </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    {helpLinks.map((l) => (
                        <Link
                            key={l.href}
                            href={localePath(locale, l.href)}
                            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
                        >
                            {l.label}
                            <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}

"use client";

import Link from "next/link";
import { Eye, Mail } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { getDictionary } from "@/lib/i18n";
import { localeHref, useLocaleFromPath } from "@/components/site-header";

type SocialLinks = { facebook: string | null; youtube: string | null };

/** Only an absolute http(s) link renders — defense against a bad setting. */
function safeSocialHref(value: string | null): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

export function SiteFooter({ socialLinks }: { socialLinks?: SocialLinks }) {
    const locale = useLocaleFromPath();
    const dict = getDictionary(locale);
    const facebookHref = safeSocialHref(socialLinks?.facebook ?? null);
    const youtubeHref = safeSocialHref(socialLinks?.youtube ?? null);

    const sections = [
        { href: "/photo-stories", label: dict.nav.photoStories },
        { href: "/news", label: dict.nav.news },
        { href: "/notices", label: dict.nav.notices },
        { href: "/buy-sell", label: dict.nav.buySell },
        { href: "/culture", label: dict.nav.culture },
        { href: "/locations", label: dict.nav.locations },
    ];
    const community = [
        { href: "/submit", label: dict.nav.submit },
        { href: "/contributors", label: dict.nav.contributors },
        { href: "/advertise", label: dict.nav.advertise },
        { href: "/search", label: dict.nav.search },
    ];
    const legal = [
        { href: "/about/terms", label: dict.footer.terms },
        { href: "/about/privacy", label: dict.footer.privacy },
        { href: "/about/guidelines", label: dict.footer.guidelines },
        { href: "/about/copyright", label: dict.footer.copyright },
        { href: "/about/contact", label: dict.footer.contact },
    ];

    return (
        <footer className="border-t bg-muted/40">
            <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6">
                <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                    <div>
                        <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <Eye className="h-4 w-4" aria-hidden />
                            </span>
                            {dict.footer.aboutTitle}
                        </p>
                        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            {dict.footer.aboutText}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            {facebookHref ? (
                                <Link
                                    href={facebookHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Facebook"
                                    className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                    <FacebookIcon className="h-4 w-4" />
                                </Link>
                            ) : null}
                            {youtubeHref ? (
                                <Link
                                    href={youtubeHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="YouTube"
                                    className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                    <YoutubeIcon className="h-4 w-4" />
                                </Link>
                            ) : null}
                            <Link
                                href={localeHref(locale, "/about/contact")}
                                aria-label={dict.footer.contact}
                                className="flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <Mail className="h-4 w-4" aria-hidden />
                            </Link>
                        </div>
                    </div>

                    <FooterColumn title={dict.footer.sections} links={sections.map((l) => ({ ...l, href: localeHref(locale, l.href) }))} />
                    <FooterColumn title={dict.footer.community} links={community.map((l) => ({ ...l, href: localeHref(locale, l.href) }))} />
                    <FooterColumn title={dict.footer.legal} links={legal.map((l) => ({ ...l, href: localeHref(locale, l.href) }))} />
                </div>

                <Separator className="my-8" />

                <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
                    <p>
                        © {new Date().getFullYear()} Eagle Eye Africa. {dict.footer.rights}
                    </p>
                    <p>{dict.footer.madeIn}</p>
                </div>
            </div>
        </footer>
    );
}

function FacebookIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
            <path d="M13.5 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.6 1.7-1.6h1.6V3.1c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.5H7.6v3.2h2.8V21h3.1z" />
        </svg>
    );
}

function YoutubeIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
            <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15.2V8.8L15.5 12 10 15.2z" />
        </svg>
    );
}

function FooterColumn({
    title,
    links,
}: {
    title: string;
    links: { href: string; label: string }[];
}) {
    return (
        <nav aria-label={title}>
            <p className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</p>
            <ul className="mt-3 space-y-2">
                {links.map((link) => (
                    <li key={link.href}>
                        <Link
                            href={link.href}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
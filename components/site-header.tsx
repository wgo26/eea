"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPaletteButton } from "@/components/system/command-palette";
import { ContrastToggle } from "@/components/system/contrast-toggle";
import type { ChromeStrings } from "@/lib/i18n/chrome";
import { locales, type Locale } from "@/lib/i18n/config";

/** Prefixes a canonical path with the active locale (prefix-all model). */
export function localeHref(locale: Locale, path: string): string {
    if (path.startsWith("http") || path.startsWith("/fr") || path.startsWith("/en")) return path;
    if (path === "/") return `/${locale}`;
    return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Detects the active locale from the URL (en/fr prefix), defaulting to English. */
export function useLocaleFromPath(): Locale {
    const pathname = usePathname() ?? "/";
    const first = pathname.split("/")[1];
    return (locales as readonly string[]).includes(first) ? (first as Locale) : "en";
}

function stripLocalePrefix(path: string): string {
    const first = path.split("/")[1];
    if ((locales as readonly string[]).includes(first)) {
        const stripped = "/" + path.split("/").slice(2).join("/");
        // "/en" -> "/" ; "/en/" -> "/" ; "/en/photo-stories" -> "/photo-stories"
        if (stripped === "/" || stripped === "//") return "/";
        // handle double slash edge
        return stripped.replace(/\/+$/, "") || "/";
    }
    return path || "/";
}

const SECTION_PATHS = [
    { key: "photoStories", path: "/photo-stories" },
    { key: "news", path: "/news" },
    { key: "notices", path: "/notices" },
    { key: "buySell", path: "/buy-sell" },
    { key: "culture", path: "/culture" },
    { key: "locations", path: "/locations" },
] as const;

/**
 * A2: nav labels arrive as a prop (sliced server-side from the chrome
 * strings) so this every-page client component never imports the full
 * dictionary — and its ~147 KB of admin vocabulary — into the bundle.
 */
export function useNavItems(nav: ChromeStrings["nav"]) {
    const locale = useLocaleFromPath();
    return SECTION_PATHS.map(({ key, path }) => ({
        href: localeHref(locale, path),
        label: nav[key],
        path,
    }));
}

export type SiteBranding = {
    logoUrl: string | null
    siteName: string | null
    siteTagline: string | null
    siteNameFr?: string | null
    siteTaglineFr?: string | null
}

/** Only an absolute http(s) URL or site-relative path renders as a logo. */
function safeLogoSrc(value: string | null): string | null {
    if (!value) return null
    if (value.startsWith('/')) {
        if (value.includes('..') || /[\s<>"]/.test(value)) return null
        return value
    }
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
    } catch {
        return null
    }
}

/**
 * A2: all user-visible strings arrive via the `chrome` prop from the server
 * shell — this component must not import getDictionary (see
 * scripts/verify-client-dictionary.mjs).
 */
export function SiteHeader({ branding, chrome }: { branding?: SiteBranding; chrome: ChromeStrings }) {
    const locale = useLocaleFromPath();
    const dict = chrome;
    const items = useNavItems(chrome.nav);
    const pathname = usePathname() ?? "/";
    const logoSrc = safeLogoSrc(branding?.logoUrl ?? null);
    const siteName =
      locale === 'fr'
        ? branding?.siteNameFr?.trim() || branding?.siteName?.trim() || SITE_NAME
        : branding?.siteName?.trim() || SITE_NAME;
    const tagline =
      locale === 'fr'
        ? branding?.siteTaglineFr?.trim() || branding?.siteTagline?.trim() || dict.header.tagline
        : branding?.siteTagline?.trim() || dict.header.tagline;

    return (
        <header className="no-print sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:px-6">
                <Link
                    href={localeHref(locale, "/")}
                    className="flex shrink-0 items-center gap-2"
                    aria-label={siteName}
                >
                    {logoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoSrc}
                            alt={siteName}
                            className="h-9 w-auto max-w-36 rounded-lg object-contain"
                        />
                    ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            <Eye className="h-5 w-5" aria-hidden />
                        </span>
                    )}
                    <span className="hidden flex-col leading-tight sm:flex">
                        <span className="text-sm font-extrabold tracking-tight">{siteName}</span>
                        <span className="text-[10px] font-medium text-muted-foreground">
                            {tagline}
                        </span>
                    </span>
                </Link>

                <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">
                    {items.map((item) => {
                        const canonical = (item as { path?: string }).path ?? stripLocalePrefix(item.href)
                        const stripped = stripLocalePrefix(pathname)
                        const isActive =
                            stripped === canonical || stripped.startsWith(`${canonical}/`) ||
                            pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={`rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                                    isActive
                                        ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="ml-auto flex items-center gap-1.5">
                    <CommandPaletteButton locale={locale} chrome={{ nav: chrome.nav, command: chrome.command }} />
                    <LanguageSwitcher locale={locale} />
                    <ThemeToggle labels={chrome.theme} />
                    <ContrastToggle label={dict.theme.contrast} />
                    <Button
                        size="sm"
                        className="hidden md:inline-flex"
                        render={<Link href={localeHref(locale, "/submit")} />}
                    >
                        {dict.nav.submit}
                    </Button>
                    <MobileNav
                        items={items}
                        searchAction={localeHref(locale, "/search")}
                        searchPlaceholder={dict.header.searchPlaceholder}
                        searchLabel={dict.nav.search}
                        menuLabel={dict.header.menu}
                        submitHref={localeHref(locale, "/submit")}
                        submitLabel={dict.nav.submit}
                    />
                </div>
            </div>
        </header>
    );
}

const SITE_NAME = "Eagle Eye Africa";

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteMark } from "@/components/site-mark";
import { MobileNav } from "@/components/mobile-nav";
import { PlaceSelector } from "@/components/locations/place-selector";
import { PlacePrompt } from "@/components/locations/place-prompt";
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

// P1: max 5 primary destinations (Home + Stories + Notices + Market + Places).
// News + Photo Stories + Culture fold into the single Stories feed per merged
// audit (old vertical routes still resolve; they are archive views, not nav).
const SECTION_PATHS = [
    { key: "home", path: "/" },
    { key: "stories", path: "/stories" },
    { key: "notices", path: "/notices" },
    { key: "buySell", path: "/buy-sell" },
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

/**
 * A2: all user-visible strings arrive via the `chrome` prop from the server
 * shell — this component must not import getDictionary (see
 * scripts/verify-client-dictionary.mjs).
 *
 * Signature: lens-ring accent on active nav + submit button.
 */
export function SiteHeader({ branding, chrome }: { branding?: SiteBranding; chrome: ChromeStrings }) {
    const locale = useLocaleFromPath();
    const dict = chrome;
    const items = useNavItems(chrome.nav);
    const pathname = usePathname() ?? "/";
    const siteName =
      locale === 'fr'
        ? branding?.siteNameFr?.trim() || branding?.siteName?.trim() || SITE_NAME
        : branding?.siteName?.trim() || SITE_NAME;
    const tagline =
      locale === 'fr'
        ? branding?.siteTaglineFr?.trim() || branding?.siteTagline?.trim() || dict.header.tagline
        : branding?.siteTagline?.trim() || dict.header.tagline;

    return (
        <header className="no-print sticky top-0 z-50 w-full border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 md:px-6">
                <Link
                    href={localeHref(locale, "/")}
                    className="flex shrink-0 items-center gap-2"
                    aria-label={siteName}
                >
                    <SiteMark
                        logoUrl={branding?.logoUrl ?? null}
                        alt={siteName}
                        badgeClassName="h-9 w-9 rounded-xl"
                        iconClassName="h-5 w-5"
                        imgClassName="h-9 w-auto max-w-36 rounded-lg object-contain"
                    />
                    <span className="hidden flex-col leading-tight sm:flex">
                        <span className="text-sm font-extrabold tracking-tight">{siteName}</span>
                        <span className="text-xs font-medium text-muted-foreground">
                            {tagline}
                        </span>
                    </span>
                </Link>

                <nav className="hidden items-center gap-0.5 lg:flex" aria-label={chrome.nav.main}>
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
                                // Public "you are here" keeps brand blue on purpose:
                                // the admin shell uses gold instead, so the hue
                                // itself tells visitors which mode they are in.
                                // Signature: lens-ring underline on active.
                                className={`relative rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-lens ${
                                    isActive
                                        ? "font-semibold text-foreground hover:text-foreground"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                }`}
                            >
                                {item.label}
                                {isActive && (
                                    <span
                                        aria-hidden
                                        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-3/4 rounded-full bg-lens"
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="flex items-center justify-self-end gap-1.5">
                    <PlaceSelector locale={locale} dict={chrome.locations} />
                    <PlacePrompt locale={locale} dict={chrome.locations} />
                    <Button
                        size="sm"
                        className="hidden lg:inline-flex focus-lens"
                        render={<Link href={localeHref(locale, "/submit")} />}
                    >
                        {dict.nav.post}
                    </Button>
                    <MobileNav
                        items={items}
                        searchAction={localeHref(locale, "/search")}
                        searchPlaceholder={dict.header.searchPlaceholder}
                        searchLabel={dict.nav.search}
                        navigationLabel={chrome.nav.main}
                        menuLabel={dict.header.menu}
                        submitHref={localeHref(locale, "/submit")}
                        submitLabel={dict.nav.post}
                    />
                </div>
            </div>
        </header>
    );
}

const SITE_NAME = "Eagle Eye Africa";

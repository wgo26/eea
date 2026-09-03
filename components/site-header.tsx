"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileNav } from "@/components/mobile-nav";
import { getDictionary, locales, type Locale } from "@/lib/i18n";

/** Prefixes a canonical path with /fr when the active locale is French. */
export function localeHref(locale: Locale, path: string): string {
    if (path.startsWith("http") || path.startsWith("/fr") || path.startsWith("/en")) return path;
    if (locale === "fr") return path === "/" ? "/fr" : `/fr${path}`;
    return path;
}

/** Detects the active locale from the URL (en/fr prefix), defaulting to English. */
export function useLocaleFromPath(): Locale {
    const pathname = usePathname() ?? "/";
    const first = pathname.split("/")[1];
    return (locales as readonly string[]).includes(first) ? (first as Locale) : "en";
}

const SECTION_PATHS = [
    { key: "photoStories", path: "/photo-stories" },
    { key: "news", path: "/news" },
    { key: "notices", path: "/notices" },
    { key: "buySell", path: "/buy-sell" },
    { key: "culture", path: "/culture" },
    { key: "locations", path: "/locations" },
] as const;

export function useNavItems() {
    const locale = useLocaleFromPath();
    const dict = getDictionary(locale);
    return SECTION_PATHS.map(({ key, path }) => ({
        href: localeHref(locale, path),
        label: dict.nav[key],
    }));
}

export function SiteHeader() {
    const locale = useLocaleFromPath();
    const dict = getDictionary(locale);
    const items = useNavItems();
    const pathname = usePathname() ?? "/";

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 md:px-6">
                <Link
                    href={localeHref(locale, "/")}
                    className="flex shrink-0 items-center gap-2"
                    aria-label={SITE_NAME}
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Eye className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="hidden flex-col leading-tight sm:flex">
                        <span className="text-sm font-extrabold tracking-tight">{SITE_NAME}</span>
                        <span className="text-[10px] font-medium text-muted-foreground">
                            {dict.header.tagline}
                        </span>
                    </span>
                </Link>

                <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">
                    {items.map((item) => {
                        const isActive =
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
                    <LanguageSwitcher locale={locale} />
                    <ThemeToggle locale={locale} />
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
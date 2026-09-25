import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { themeInitScript } from "@/lib/theme";
import { localeInitScript } from "@/lib/i18n/locale-init";
import { SITE } from "@/lib/constants";
import { DEFAULT_OG_IMAGE, TWITTER_CARD } from "@/lib/seo/og";
import { BrandThemeStyle } from "@/components/brand-theme-style";

// Self-hosted via next/font/local (app/fonts/*.woff2) so dev/build never
// hits fonts.googleapis.com — no network dependency, no proxy config needed.
const inter = localFont({
    src: "./fonts/Inter-Variable.woff2",
    variable: "--font-sans",
    weight: "100 900",
    display: "swap",
});

/**
 * Display serif for editorial headlines (Newsreader, "newspaper of record"
 * feel). Two static latin weights (700 + 800 ≈ 47 KB total) instead of the
 * 132 KB full variable file — the data-plan budget wins over weight
 * interpolation. `display: swap` + opt-in `font-display` utility means body
 * UI text never triggers the download; only pages rendering display
 * headlines fetch it (cached immutably by next/font's hashed URL).
 */
const newsreader = localFont({
    src: [
        { path: "./fonts/Newsreader-Bold.woff2", weight: "700" },
        { path: "./fonts/Newsreader-ExtraBold.woff2", weight: "800" },
    ],
    variable: "--font-display",
    display: "swap",
});

// Phase 1 font budget: GeistSans was dead code (globals.css only references
// --font-sans, never --font-geist-sans) and is not loaded. GeistMono is
// admin/account-only — loaded by appFonts in app/[locale]/(app)/fonts.ts so
// anonymous public pages never download it.

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#0f172a',
    colorScheme: 'light dark',
};

export const metadata: Metadata = {
    title: {
        default: SITE.name,
        template: `%s · ${SITE.shortName}`,
    },    description: SITE.description,
    metadataBase: new URL(SITE.url),
    // Default social-share card (1200×630): inherited by every route that
    // does not define its own openGraph (homepage, section indexes,
    // advertise, locations, …). Detail pages that set openGraph.images keep
    // their real cover — Next shallow-merges metadata per segment, so a
    // page-level openGraph fully replaces this one (documented behaviour).
    openGraph: {
        type: "website",
        siteName: SITE.name,
        images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: {
        card: TWITTER_CARD,
        images: [DEFAULT_OG_IMAGE],
    },
    alternates: {
        types: { 'application/rss+xml': '/rss.xml' },
    },
    // Tab icon is dynamic: /icon.svg (and /favicon.ico) are route handlers

    // that redirect to the uploaded site logo (see lib/site-icon.ts). This
    // link makes browsers prefer the SVG-capable URL over bare /favicon.ico
    // auto-discovery. Replaces the old static demo-mark app/icon.svg.
    icons: {
        icon: "/icon.svg",
        apple: "/icons/icon-192.png",
    },
    appleWebApp: {
        capable: true,
        title: SITE.shortName,
        statusBarStyle: "black-translucent",
    },
};

/**
 * Root layout — document shell only (html/body, fonts, theme + locale
 * bootstrap). UI chrome is owned by the route groups: (public) renders the
 * public header/footer, (app) renders the admin/account shells, (focused)
 * renders the minimal flow shell. No page ever renders without a shell
 * decision.
 *
 * Phase 4.1 (audit §4.1): this layout reads NO request-time APIs. The old
 * headers() locale lookup made every route in the app dynamically
 * server-rendered; now the shell is static, `lang` is corrected pre-paint by
 * localeInitScript (and kept in sync client-side by HtmlLang in the [locale]
 * layout), the localized cookie banner lives in the [locale] layout (which
 * owns the locale param), and per-page canonical/hreflang metadata
 * (buildAlternates) carries the language signal for the static shell.
 * ISR pages under [locale] can now actually prerender.
 */
type RootLayoutProps = Readonly<{ children: React.ReactNode }>

export default async function RootLayout({ children }: RootLayoutProps) {

    // Phase 1 font budget: anonymous public readers get Inter only. The
    // GeistMono variable is NOT attached here (it was 58 KB of unused font
    // bytes on every public page — font-mono is only used in admin/account
    // surfaces, which set the variable via the (app) layout instead).
    // --font-geist-sans was already dead (only --font-sans is referenced in
    // globals.css), so the GeistSans download is dropped entirely.
    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={cn(
                "h-full",
                "antialiased",
                "font-sans",
                inter.variable,
                newsreader.variable
            )}
        >
            <body className="flex min-h-full flex-col">
                {/* Published brand tokens, ahead of the pre-paint bootstrap so a
                    theme is applied before the .dark class lands. See
                    components/brand-theme-style.tsx for why this sits in body. */}
                <BrandThemeStyle />
                {/* Pre-paint bootstrap scripts — theme + lang before first render. */}
                <Script
                    id="theme-init"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: themeInitScript }}
                />
                <Script
                    id="locale-init"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: localeInitScript }}
                />
                {children}
            </body>
        </html>
    );
}
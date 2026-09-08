import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { themeInitScript } from "@/lib/theme";
import { localeInitScript } from "@/lib/i18n/locale-init";
import { SITE } from "@/lib/constants";

// Self-hosted via next/font/local (app/fonts/*.woff2) so dev/build never
// hits fonts.googleapis.com — no network dependency, no proxy config needed.
const inter = localFont({
    src: "./fonts/Inter-Variable.woff2",
    variable: "--font-sans",
    weight: "100 900",
    display: "swap",
});

const geistSans = localFont({
    src: "./fonts/Geist-Variable.woff2",
    variable: "--font-geist-sans",
    weight: "100 900",
    display: "swap",
});

const geistMono = localFont({
    src: "./fonts/GeistMono-Variable.woff2",
    variable: "--font-geist-mono",
    weight: "100 900",
    display: "swap",
});

export const metadata: Metadata = {
    title: {
        default: SITE.name,
        template: `%s · ${SITE.shortName}`,
    },
    description: SITE.description,
    metadataBase: new URL(SITE.url),
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

export default function RootLayout({ children }: RootLayoutProps) {

    return (
        <html
            lang="en"
            suppressHydrationWarning
            className={cn(
                "h-full",
                "antialiased",
                geistSans.variable,
                geistMono.variable,
                "font-sans",
                inter.variable
            )}
        >
            <body className="flex min-h-full flex-col">
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
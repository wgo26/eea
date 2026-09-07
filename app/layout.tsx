import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { themeInitScript } from "@/lib/theme";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { CookieBanner } from "@/components/system/cookie-banner";
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
 * Root layout — document shell only (html/body, fonts, theme bootstrap).
 * UI chrome is owned by the route groups: (public) renders the public
 * header/footer, (app) renders the admin/account shells, (focused) renders
 * the minimal flow shell. No page ever renders without a shell decision.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
    // proxy.ts resolves the active locale (URL prefix → cookie → Accept-Language)
    // and exposes it via the x-locale request header.
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    return (
        <html
            lang={locale}
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
                {/* Pre-paint theme script — applies light/dark/system before first render. */}
                <Script
                    id="theme-init"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: themeInitScript }}
                />
                {children}
                <CookieBanner locale={locale} dict={dict} />
            </body>
        </html>
    );
}
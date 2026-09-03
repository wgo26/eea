import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { themeInitScript } from "@/lib/theme";
import { resolveLocale } from "@/lib/i18n";
import { SITE } from "@/lib/constants";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
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
            </body>
        </html>
    );
}
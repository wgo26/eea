"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

const PLACE_COOKIE = "eea-place";

/**
 * W13 — aggregate-only analytics beacon.
 *
 * Fires exactly one POST per page-view (pathname change), sending only:
 * surface (first non-locale path segment), locale (prop — never sniffed),
 * place (optional `eea-place` cookie slug, if present). No path, query,
 * referrer, UA or identifier leaves the browser — the privacy contract is
 * enforced client-side here and server-side in app/api/analytics/event.
 *
 * Observational by design: failures are swallowed silently and the fetch
 * uses `keepalive` so it survives navigation.
 */
export function AnalyticsBeacon({ locale }: { locale: Locale }) {
    const pathname = usePathname();
    const lastSent = useRef<string | null>(null);

    useEffect(() => {
        if (!pathname) return;
        // De-dupe React strict-mode double-invokes and repeat renders of the
        // same path within one mount.
        if (lastSent.current === pathname) return;
        lastSent.current = pathname;

        const segments = pathname.split("/").filter(Boolean);
        // Strip the locale prefix: /en/news → news, /fr → home.
        const withoutLocale =
            segments[0] === "en" || segments[0] === "fr" ? segments.slice(1) : segments;
        const surface = withoutLocale[0] ?? "home";

        let place = "";
        try {
            const row = document.cookie
                .split("; ")
                .find((part) => part.startsWith(`${PLACE_COOKIE}=`));
            if (row) {
                const parsed = JSON.parse(
                    decodeURIComponent(row.split("=")[1]),
                ) as { slug?: string };
                if (typeof parsed.slug === "string" && /^[a-z0-9-]{1,64}$/.test(parsed.slug)) {
                    place = parsed.slug;
                }
            }
        } catch {
            /* cookie absent or malformed — place-agnostic count */
        }

        void fetch("/api/analytics/event", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ surface, locale, place }),
            keepalive: true,
            credentials: "omit",
        }).catch(() => {
            /* observational — never surface errors */
        });
    }, [pathname, locale]);

    return null;
}

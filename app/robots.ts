import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";

/**
 * robots.txt (checklist item 10): everything behind auth is disallowed for
 * crawlers (the app-shell layouts also emit noindex as a second layer), and
 * the locale-aware sitemap is advertised.
 *
 * NOTE: /en|/fr prefixes below are literals on purpose — robots.txt has no
 * templating, so each locale path is enumerated (the only /en|/fr hardcoding
 * this repo allows; localePath() owns every in-app link).
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/api/",
                    "/en/admin",
                    "/fr/admin",
                    "/en/account",
                    "/fr/account",
                    "/en/auth",
                    "/fr/auth",
                ],
            },
        ],
        sitemap: `${SITE.url}/sitemap.xml`,
    };
}
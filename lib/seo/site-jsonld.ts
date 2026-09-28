import { SITE } from "@/lib/constants";
import { renderJsonLd } from "./jsonld";

/**
 * Site-wide JSON-LD (Knowledge Panel + sitelink search box eligibility).
 *
 * Rendered once in the root layout — not per page — as an Organization +
 * WebSite pair. Everything resolves from live data, never literals:
 *
 * - name/logo: the brand identity (published theme → site_settings →
 *   constants), the same source as the header, tab icon and PWA manifest;
 * - sameAs: ONLY the social URLs an editor actually configured at
 *   /admin/site-content (footer links). Placeholder profiles are worse than
 *   none — Google treats them as the site's identity claims;
 * - SearchAction: the real site search (`/{defaultLocale}/search?q=` —
 *   locale-prefixed, since the bare `/search` only 307-redirects there).
 */
export type SiteJsonLdInput = {
    siteName: string;
    /** Brand logo (absolute https URL or site-relative path), if configured. */
    logoUrl: string | null;
    facebookUrl: string | null;
    youtubeUrl: string | null;
};

function absoluteLogo(logoUrl: string | null): string | undefined {
    const trimmed = logoUrl?.trim();
    if (!trimmed) return undefined;
    try {
        return new URL(trimmed, SITE.url).toString();
    } catch {
        return undefined;
    }
}

export function siteJsonLdGraph(input: SiteJsonLdInput): Record<string, unknown>[] {
    const logo = absoluteLogo(input.logoUrl);
    const sameAs = [input.facebookUrl?.trim(), input.youtubeUrl?.trim()].filter(
        (u): u is string => !!u && /^https?:\/\//i.test(u),
    );
    const organization: Record<string, unknown> = {
        "@type": "Organization",
        "@id": `${SITE.url}/#organization`,
        name: input.siteName,
        url: SITE.url,
        ...(logo ? { logo } : {}),
        ...(sameAs.length > 0 ? { sameAs } : {}),
    };
    const website: Record<string, unknown> = {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: input.siteName,
        url: SITE.url,
        inLanguage: [...SITE.locales],
        publisher: { "@id": `${SITE.url}/#organization` },
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE.url}/${SITE.defaultLocale}/search?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
        },
    };
    return [organization, website];
}

/** Serializes the site graph for dangerouslySetInnerHTML (XSS-safe). */
export function renderSiteJsonLd(input: SiteJsonLdInput): string {
    return renderJsonLd(siteJsonLdGraph(input));
}

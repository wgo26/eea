import { SITE } from "@/lib/constants";
import { localePath } from "@/lib/i18n/urls";
import { renderJsonLd } from "./jsonld";

/**
 * Site-wide JSON-LD (Knowledge Panel + sitelink search box eligibility).
 *
 * Rendered once in the root layout — not per page — as an Organization +
 * WebSite pair. Everything resolves from live data, never literals:
 *
 * - name/logo: the brand identity (published theme → site_settings →
 *   constants), the same source as the header, tab icon and PWA manifest;
 * - sameAs: ONLY the social URLs an editor configured at
 *   /admin/site-content. Placeholder profiles are worse than
 *   none — Google treats them as the site's identity claims;
 * - contact data: from public site_settings, never invented.
 * - SearchAction: the real site search (`/{defaultLocale}/search?q=` —
 *   locale-prefixed, since the bare `/search` only 307-redirects there).
 */
export type SiteJsonLdInput = {
    siteName: string;
    /** Brand logo (absolute https URL or site-relative path), if configured. */
    logoUrl: string | null;
    facebookUrl: string | null;
    youtubeUrl: string | null;
    twitterUrl: string | null;
    linkedinUrl: string | null;
    instagramUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactAddressStreet: string | null;
    contactAddressCity: string | null;
    contactAddressRegion: string | null;
    contactAddressCountry: string | null;
    contactAddressPostalCode: string | null;
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

function buildAddress(input: SiteJsonLdInput): Record<string, unknown> | undefined {
    const parts = [
        input.contactAddressStreet,
        input.contactAddressCity,
        input.contactAddressRegion,
        input.contactAddressPostalCode,
        input.contactAddressCountry,
    ].filter(Boolean);
    if (parts.length === 0) return undefined;
    return {
        "@type": "PostalAddress",
        streetAddress: input.contactAddressStreet ?? undefined,
        addressLocality: input.contactAddressCity ?? undefined,
        addressRegion: input.contactAddressRegion ?? undefined,
        postalCode: input.contactAddressPostalCode ?? undefined,
        addressCountry: input.contactAddressCountry ?? undefined,
    };
}

export function siteJsonLdGraph(input: SiteJsonLdInput): Record<string, unknown>[] {
    const siteUrl = SITE.url.replace(/\/$/, "");
    const logo = absoluteLogo(input.logoUrl);
    const sameAs = [
        input.facebookUrl?.trim(),
        input.youtubeUrl?.trim(),
        input.twitterUrl?.trim(),
        input.linkedinUrl?.trim(),
        input.instagramUrl?.trim(),
    ].filter((u): u is string => !!u && /^https?:\/\//i.test(u));
    const address = buildAddress(input);
    const telephone = input.contactPhone?.trim() ? input.contactPhone.trim() : undefined;
    const email = input.contactEmail?.trim() ? input.contactEmail.trim() : undefined;

    const organization: Record<string, unknown> = {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: input.siteName,
        url: siteUrl,
        ...(logo ? { logo } : {}),
        ...(sameAs.length > 0 ? { sameAs } : {}),
        ...(email ? { email } : {}),
        ...(telephone ? { telephone } : {}),
        ...(address ? { address } : {}),
    };
    const website: Record<string, unknown> = {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: input.siteName,
        url: siteUrl,
        inLanguage: [...SITE.locales],
        publisher: { "@id": `${siteUrl}/#organization` },
        potentialAction: {
            "@type": "SearchAction",
            target: {
                "@type": "EntryPoint",
                urlTemplate: `${siteUrl}${localePath(SITE.defaultLocale, "/search")}?q={search_term_string}`,
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

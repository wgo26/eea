import { loadBrandIdentity } from "@/lib/branding/identity";
import { getPublicSiteSettings } from "@/lib/admin/queries/settings";
import { renderSiteJsonLd } from "@/lib/seo/site-jsonld";

/**
 * Site-wide Organization + WebSite JSON-LD (Knowledge Panel + sitelink
 * search box eligibility). Rendered once in the root layout from live brand
 * data — the same identity as the header, tab icon and PWA manifest — so a
 * rebrand at /admin/site-content updates the structured data with it.
 * Cached-reads-only, so the static shell stays prerenderable.
 */
export async function SiteJsonLd() {
    const [identity, settings] = await Promise.all([
        loadBrandIdentity(),
        getPublicSiteSettings(),
    ]);
    const __html = renderSiteJsonLd({
        siteName: identity.siteName,
        logoUrl: identity.logoUrl,
        facebookUrl: settings.facebookUrl,
        youtubeUrl: settings.youtubeUrl,
        twitterUrl: settings.twitterUrl,
        linkedinUrl: settings.linkedinUrl,
        instagramUrl: settings.instagramUrl,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        contactAddressStreet: settings.contactAddressStreet,
        contactAddressCity: settings.contactAddressCity,
        contactAddressRegion: settings.contactAddressRegion,
        contactAddressCountry: settings.contactAddressCountry,
        contactAddressPostalCode: settings.contactAddressPostalCode,
    });
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html }} />;
}

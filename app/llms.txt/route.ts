import { SITE } from "@/lib/constants";
import { localePath } from "@/lib/i18n/urls";
import { loadBrandIdentity } from "@/lib/branding/identity";
import { getPublicSiteSettings } from "@/lib/admin/queries/settings";

/**
 * llms.txt — a plain-text summary of the site for AI agents and crawlers.
 *
 * Served at /llms.txt (exempt from locale redirect like sitemap.xml/robots.txt).
 * Best-effort: reads only cached data; an unreachable DB yields a valid minimal
 * document instead of 500. Revalidates on the public-content window.
 */
export const revalidate = 300;

export async function GET() {
    const identity = await loadBrandIdentity();
    const settings = await getPublicSiteSettings();

    const siteName = identity.siteName;
    const siteDescription = identity.tagline?.trim() || SITE.description;
    const siteUrl = SITE.url.replace(/\/$/, "");
    const pageUrl = (path: string) => `${siteUrl}${localePath(SITE.defaultLocale, path)}`;

    // Build contact block if configured
    const contactLines: string[] = [];
    if (settings.contactEmail) contactLines.push(`Email: ${settings.contactEmail}`);
    if (settings.contactPhone) contactLines.push(`Phone: ${settings.contactPhone}`);
    if (settings.contactWhatsapp) contactLines.push(`WhatsApp: ${settings.contactWhatsapp}`);
    if (
        settings.contactAddressStreet ||
        settings.contactAddressCity ||
        settings.contactAddressRegion ||
        settings.contactAddressPostalCode ||
        settings.contactAddressCountry
    ) {
        const addrParts = [
            settings.contactAddressStreet,
            settings.contactAddressCity,
            settings.contactAddressRegion,
            settings.contactAddressPostalCode,
            settings.contactAddressCountry,
        ].filter(Boolean);
        if (addrParts.length > 0) contactLines.push(`Address: ${addrParts.join(", ")}`);
    }

    // Social profiles for sameAs verification
    const socialLines: string[] = [];
    if (settings.facebookUrl) socialLines.push(`Facebook: ${settings.facebookUrl}`);
    if (settings.twitterUrl) socialLines.push(`X (Twitter): ${settings.twitterUrl}`);
    if (settings.linkedinUrl) socialLines.push(`LinkedIn: ${settings.linkedinUrl}`);
    if (settings.instagramUrl) socialLines.push(`Instagram: ${settings.instagramUrl}`);
    if (settings.youtubeUrl) socialLines.push(`YouTube: ${settings.youtubeUrl}`);

    const lines = [
        `# ${siteName}`,
        "",
        siteDescription,
        "",
        `Website: ${siteUrl}`,
        "",
        "## Key Pages",
        "",
        `- Home: ${pageUrl("/")}`,
        `- Photo Stories: ${pageUrl("/photo-stories")}`,
        `- Community News: ${pageUrl("/news")}`,
        `- Notices: ${pageUrl("/notices")}`,
        `- Culture & Entertainment: ${pageUrl("/culture")}`,
        `- Buy & Sell Marketplace: ${pageUrl("/buy-sell")}`,
        `- Locations: ${pageUrl("/locations")}`,
        `- Contributors: ${pageUrl("/contributors")}`,
        `- Submit a Story: ${pageUrl("/submit")}`,
        `- Daily Digest: ${pageUrl("/digest")}`,
        `- Advertise: ${pageUrl("/advertise")}`,
        `- About: ${pageUrl("/about")}`,
        `- Community Guide: ${pageUrl("/about/guide")}`,
        `- Corrections Register: ${pageUrl("/about/corrections")}`,
        `- Search: ${pageUrl("/search")}`,
        "",
        "## Content Types",
        "",
        "- Photo Stories: Visual essays from African communities, with credited photographers and verification badges.",
        "- Community News: Hyperlocal reporting with live timelines, corrections, and source transparency.",
        "- Notices: Official and community notices (road closures, lost & found, alerts) with expiry and trust layers.",
        "- Culture & Entertainment: Arts, events, music, fashion, food, and the people shaping African culture.",
        "- Buy & Sell: Community marketplace for goods, vehicles, property, and services — reviewed before publication.",
        "",
        "## Verification & Trust",
        "",
        "Every story carries a verification badge:",
        "- Verified on the ground: Checked by editors against primary sources.",
        "- Community submission: Basic checks passed, full verification pending.",
        "- Official source: Republished from an official statement/document.",
        "- Developing: Story unfolding; updates on live timeline.",
        "",
        "Corrections are published in the Correction Register with what was reported and what changed.",
        "",
        "## Contact",
        ...(contactLines.length > 0 ? contactLines : ["(No public contact details configured)"]),
        "",
        "## Social Profiles (sameAs)",
        ...(socialLines.length > 0 ? socialLines : ["(No social profiles configured)"]),
        "",
        "## Feeds",
        "",
        `- RSS: ${siteUrl}/rss.xml`,
        `- Sitemap: ${siteUrl}/sitemap.xml`,
        "",
        "## Licensing",
        "",
        `Content is published under the site's Terms of Use. See ${pageUrl("/about/terms")} for details.`,
        "",
        "---",
        "",
        `Generated at ${new Date().toISOString()} by ${siteName}`,
    ];

    const text = lines.join("\n");

    return new Response(text, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
    });
}
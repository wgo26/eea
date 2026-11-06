import { getHomeData } from "@/lib/queries/home";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { SITE } from "@/lib/constants";

/**
 * Markdown alternate for the homepage — served when agents request
 * Accept: text/markdown. Dramatically reduces token cost vs HTML.
 *
 * This route is exempt from locale redirect (asset-like extension).
 * Best-effort: DB failure yields minimal valid markdown.
 */
export const revalidate = 300;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ locale: string }> },
) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const data = await getHomeData(locale);
    const siteUrl = SITE.url.replace(/\/$/, "");
    const pageUrl = (path: string) => `${siteUrl}${localePath(locale, path)}`;
    const short = (value: string, limit = 240) =>
        value.length > limit ? `${value.slice(0, limit).trimEnd()}...` : value;

    const lines: string[] = [];

    // Front matter / title
    lines.push(`# ${dict.meta.title}`);
    lines.push("");
    lines.push(dict.meta.description);
    lines.push("");

    // Hero section
    if (data?.hero) {
        lines.push(`## ${dict.home.kicker}`);
        lines.push("");
        if (data.hero.title) lines.push(`### ${short(data.hero.title)}`);
        if (data.hero.excerpt) lines.push(short(data.hero.excerpt, 320));
        lines.push("");
    }

    // Photo Stories
    if (data?.photoStories?.length) {
        lines.push(`## ${dict.home.latestPhotoStories}`);
        lines.push("");
        for (const story of data.photoStories.slice(0, 3)) {
            if (story.title) lines.push(`- [${short(story.title)}](${siteUrl}${story.href})`);
        }
        lines.push(`- [${dict.home.viewAllPhotoStories}](${pageUrl("/photo-stories")})`);
        lines.push("");
    }

    // News
    if (data?.news?.length) {
        lines.push(`## ${dict.home.latestNews}`);
        lines.push("");
        for (const article of data.news.slice(0, 3)) {
            if (article.title) lines.push(`- [${short(article.title)}](${siteUrl}${article.href})`);
        }
        lines.push(`- [${dict.home.viewAllNews}](${pageUrl("/news")})`);
        lines.push("");
    }

    // Notices
    if (data?.notices?.length) {
        lines.push(`## ${dict.home.latestNotices}`);
        lines.push("");
        for (const notice of data.notices.slice(0, 3)) {
            if (notice.title) lines.push(`- [${short(notice.title)}](${siteUrl}${notice.href})`);
        }
        lines.push(`- [${dict.home.viewAllNotices}](${pageUrl("/notices")})`);
        lines.push("");
    }

    // Buy & Sell (listings)
    if (data?.listings?.length) {
        lines.push(`## ${dict.home.buySell}`);
        lines.push("");
        for (const listing of data.listings.slice(0, 3)) {
            if (listing.title) lines.push(`- [${short(listing.title)}](${siteUrl}${listing.href})`);
        }
        lines.push(`- [${dict.home.viewAllBuySell}](${pageUrl("/buy-sell")})`);
        lines.push("");
    }

    // Culture
    if (data?.culture?.length) {
        lines.push(`## ${dict.home.culture}`);
        lines.push("");
        for (const item of data.culture.slice(0, 3)) {
            if (item.title) lines.push(`- [${short(item.title)}](${siteUrl}${item.href})`);
        }
        lines.push(`- [${dict.home.viewAllCulture}](${pageUrl("/culture")})`);
        lines.push("");
    }

    // Featured stories
    if (data?.featured?.length) {
        lines.push(`## ${dict.home.latestPhotoStories} (Featured)`);
        lines.push("");
        for (const story of data.featured.slice(0, 2)) {
            if (story.title) lines.push(`- [${short(story.title)}](${siteUrl}${story.href})`);
        }
        lines.push("");
    }

    // CTA sections
    lines.push(`## ${dict.home.submitCtaTitle}`);
    lines.push("");
    lines.push(dict.home.submitCtaBody);
    lines.push("");
    lines.push(`[${dict.home.submitCtaButton}](${pageUrl("/submit")})`);
    lines.push("");

    lines.push(`## ${dict.home.digestCtaTitle}`);
    lines.push("");
    lines.push(dict.home.digestCtaBody);
    lines.push("");
    lines.push(`[${dict.home.digestCtaButton}](${pageUrl("/digest")})`);
    lines.push("");

    // Footer links
    lines.push("---");
    lines.push("");
    lines.push("## Navigation");
    lines.push("");
    lines.push(`- [${dict.nav.home}](${pageUrl("/")})`);
    lines.push(`- [${dict.nav.photoStories}](${pageUrl("/photo-stories")})`);
    lines.push(`- [${dict.nav.news}](${pageUrl("/news")})`);
    lines.push(`- [${dict.nav.notices}](${pageUrl("/notices")})`);
    lines.push(`- [${dict.nav.culture}](${pageUrl("/culture")})`);
    lines.push(`- [${dict.nav.buySell}](${pageUrl("/buy-sell")})`);
    lines.push(`- [${dict.nav.locations}](${pageUrl("/locations")})`);
    lines.push(`- [${dict.nav.contributors}](${pageUrl("/contributors")})`);
    lines.push(`- [${dict.nav.submit}](${pageUrl("/submit")})`);
    lines.push(`- [${dict.nav.digest}](${pageUrl("/digest")})`);
    lines.push(`- [${dict.nav.advertise}](${pageUrl("/advertise")})`);
    lines.push(`- [${dict.nav.about}](${pageUrl("/about")})`);
    lines.push("");

    lines.push("---");
    lines.push("");
    lines.push(`*Generated at ${new Date().toISOString()} by ${SITE.name}*`);

    const markdown = lines.join("\n");

    return new Response(markdown, {
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
            "Vary": "Accept",
        },
    });
}
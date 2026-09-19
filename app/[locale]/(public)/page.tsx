import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates } from "@/lib/i18n/urls";
import { getHomeData } from "@/lib/queries/home";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/og";
import { SubmitCta } from "@/components/home/submit-cta";
import {
    AdSkeleton,
    GridSkeleton,
    HeroSkeleton,
    HomeBannerAd,
    HomeBoard,
    HomeCulture,
    HomeHeroSection,
    HomeInlineBottomAd,
    HomeInlineMidAd,
    HomeNewsTrending,
    HomePhotoStories,
} from "@/components/home/home-sections";

type LocaleHomePageProps = { params: Promise<{ locale: string }> };

/**
 * Phase 4.1 (audit §4.1) — ISR. The homepage reads no request-time APIs
 * (locale comes from the [locale] segment; the header/footer self-localize
 * from the URL client-side), so the route is statically prerendered and
 * revalidated on this window or on demand via revalidateTag('home', 'max').
 * The literal is required by the static-analyzability rule for segment config.
 */
export const revalidate = 300;

/**
 * Homepage metadata: the page's own localized canonical + hreflang pair
 * (checklist item 10) — the old layout-level canonical (`/en` for every
 * nested page) was removed, so each page owns its alternates now.
 */
export async function generateMetadata({
    params,
}: LocaleHomePageProps): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    // Most-shared URL: use the hero cover when available so WhatsApp/FB
    // renders a photo, falling back to the branded default.
    let ogImage: string | null = null;
    try {
        const data = await getHomeData(locale);
        ogImage =
            data.hero?.imageUrl ??
            data.featured[0]?.imageUrl ??
            data.photoStories[0]?.imageUrl ??
            data.news[0]?.imageUrl ??
            null;
    } catch {
        ogImage = null;
    }
    return {
        title: dict.meta.title,
        description: dict.meta.description,
        alternates: buildAlternates(locale, "/"),
        openGraph: {
            title: dict.meta.title,
            description: dict.meta.description,
            images: [{ url: ogImage ?? DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
        },
    };
}

/**
 * Homepage (spec §1A + sitemap §2) — a hub, not a destination: every module
 * routes into one of the content verticals or into /submit.
 *
 * A3 — streaming: the page itself awaits nothing but the locale, so the
 * shell streams instantly; the hero resolves first and each rail streams in
 * behind a shell-matched skeleton instead of the whole page waiting for the
 * slowest query. Sections share one cached getHomeData() read.
 */
export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-6 md:px-6 md:py-10">
            <Suspense fallback={<HeroSkeleton />}>
                <HomeHeroSection locale={locale} dict={dict} />
            </Suspense>

            <Suspense fallback={<AdSkeleton />}>
                <HomeBannerAd locale={locale} dict={dict} />
            </Suspense>

            {/* Only surface live editorial sections. Empty cards and ad
                placeholders make the homepage look unfinished. */}
            <Suspense fallback={<GridSkeleton />}>
                <HomePhotoStories locale={locale} dict={dict} />
            </Suspense>

            {/* Latest Community News + Trending rail */}
            <Suspense fallback={<GridSkeleton />}>
                <HomeNewsTrending locale={locale} dict={dict} />
            </Suspense>

            {/* Inline ad — mid page (spec §11) */}
            <Suspense fallback={<AdSkeleton />}>
                <HomeInlineMidAd locale={locale} dict={dict} />
            </Suspense>

            {/* Notices + Buy & Sell previews (One Community Board, Diff. #4) */}
            <Suspense fallback={<GridSkeleton cards={2} />}>
                <HomeBoard locale={locale} dict={dict} />
            </Suspense>

            {/* Culture & Entertainment preview */}
            <Suspense fallback={<GridSkeleton cards={3} />}>
                <HomeCulture locale={locale} dict={dict} />
            </Suspense>

            {/* Inline ad — before the participation loop CTA (spec §11) */}
            <Suspense fallback={<AdSkeleton />}>
                <HomeInlineBottomAd locale={locale} dict={dict} />
            </Suspense>

            <SubmitCta dict={dict} submitHref={`/${locale}/submit`} />
        </div>
    );
}

import { getHomeData } from "@/lib/queries/home";
import type { Dictionary, Locale } from "@/lib/i18n";
import { HomeHero } from "@/components/home/home-hero";
import { EmptySection, StoryCard } from "@/components/home/story-card";
import { SectionHeader } from "@/components/home/section-header";
import { AdSlot } from "@/components/home/ad-slot";
import { ListingCard } from "@/components/home/listing-card";
import { NoticesList } from "@/components/home/notices-list";
import { ExploreTiles } from "@/components/home/explore-tiles";
import { TrendingList } from "@/components/home/trending-list";

/**
 * A3 — streaming homepage sections.
 *
 * Each section is an async server component that reads the homepage dataset
 * through `getHomeData` (cached under the `home` tag, so N concurrent
 * section reads cost a single database round-trip) and renders the existing
 * presentational components. The page wraps each section in its own
 * `<Suspense>` with a shell-matched skeleton, so the hero streams first and
 * rails/ads follow instead of the whole page waiting for the slowest query.
 *
 * Phase 1: this module reads NO request-time APIs (no cookies()/headers()),
 * so the homepage keeps `revalidate = 300`. The personalized "Near You"
 * rail lives in home-near-you-client.tsx — it reads the place cookie and
 * fetches its content client-side after the static shell streams.
 */

type SectionProps = { locale: Locale; dict: Dictionary };

function href(locale: Locale, path: string): string {
    return `/${locale}${path}`;
}

/** Shell-matched skeleton: reserves the hero's space to avoid layout shift. */
export function HeroSkeleton() {
    return (
        <div aria-hidden className="grid animate-pulse gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="min-h-80 rounded-3xl bg-muted md:min-h-105" />
            <div className="hidden flex-col gap-4 lg:flex">
                <div className="min-h-36 rounded-2xl bg-muted" />
                <div className="min-h-36 rounded-2xl bg-muted" />
                <div className="min-h-36 rounded-2xl bg-muted" />
            </div>
        </div>
    );
}

/** Shell-matched skeleton for card-grid rails. */
export function GridSkeleton({ cards = 4 }: { cards?: number }) {
    return (
        <div aria-hidden className="animate-pulse">
            <div className="h-7 w-56 rounded-lg bg-muted" />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {Array.from({ length: cards }).map((_, i) => (
                    <div key={i} className="min-h-48 rounded-2xl bg-muted" />
                ))}
            </div>
        </div>
    );
}

/** Minimal fallback for ad slots: reserves no space when the ad is unknown. */
export function AdSkeleton() {
    return <div aria-hidden className="min-h-6" />;
}

/** "Near You" rail moved to home-near-you-client.tsx (Phase 1 ISR fix). */

/** Hero + explore tiles: the first paint after the shell. */
export async function HomeHeroSection({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    const availableSections: readonly (
        | "photoStories"
        | "news"
        | "notices"
        | "buySell"
        | "culture"
        | "locations"
    )[] = [
        "locations",
        ...(data.photoStories.length > 0 ? ["photoStories" as const] : []),
        ...(data.news.length > 0 ? ["news" as const] : []),
        ...(data.notices.length > 0 ? ["notices" as const] : []),
        ...(data.listings.length > 0 ? ["buySell" as const] : []),
        ...(data.culture.length > 0 ? ["culture" as const] : []),
    ];
    return (
        <>
            <HomeHero
                featured={data.featured}
                secondary={data.secondary}
                dict={dict}
                locale={locale}
                submitHref={href(locale, "/submit")}
                photoStoriesHref={href(locale, "/photo-stories")}
            />
            <ExploreTiles
                dict={dict}
                available={availableSections}
                hrefs={{
                    photoStories: href(locale, "/photo-stories"),
                    news: href(locale, "/news"),
                    notices: href(locale, "/notices"),
                    buySell: href(locale, "/buy-sell"),
                    culture: href(locale, "/culture"),
                    locations: href(locale, "/locations"),
                }}
            />
        </>
    );
}

/** Banner ad directly under the hero. */
export async function HomeBannerAd({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    return <AdSlot ad={data.ads.banner} dict={dict} variant="banner" />;
}

/** Latest photo stories + rail ad. */
export async function HomePhotoStories({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    if (data.photoStories.length === 0) return null;
    return (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
                <SectionHeader
                    title={dict.home.latestPhotoStories}
                    hint={dict.home.sectionHintPhoto}
                    viewAllHref={href(locale, "/photo-stories")}
                    viewAllLabel={dict.home.viewAllPhotoStories}
                />
                <div className="grid gap-5 sm:grid-cols-2">
                    {data.photoStories.map((s) => (
                        <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                    ))}
                </div>
            </div>
            <aside>
                <AdSlot
                    ad={data.ads.rail}
                    dict={dict}
                    variant="rail"
                    className="lg:sticky lg:top-24"
                />
            </aside>
        </section>
    );
}

/** Latest news + trending rail. */
export async function HomeNewsTrending({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    return (
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
                <SectionHeader
                    title={dict.home.latestNews}
                    hint={dict.home.sectionHintNews}
                    viewAllHref={href(locale, "/news")}
                    viewAllLabel={dict.home.viewAllNews}
                />
                {data.news.length > 0 ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                        {data.news.map((s) => (
                            <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                        ))}
                    </div>
                ) : (
                    <EmptySection dict={dict} href={href(locale, "/news")} label={dict.home.viewAllNews} />
                )}
            </div>
            <aside>
                <TrendingList stories={data.trending} dict={dict} locale={locale} />
            </aside>
        </section>
    );
}

/** Mid-page inline ad strip. */
export async function HomeInlineMidAd({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    if (!data.ads.inlineMid) return null;
    return <AdSlot ad={data.ads.inlineMid} dict={dict} variant="strip" />;
}

/** Notices + buy & sell board. */
export async function HomeBoard({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    if (data.notices.length === 0 && data.listings.length === 0) return null;
    return (
        <section className="grid gap-10 lg:grid-cols-2">
            {data.notices.length > 0 ? <div className="min-w-0">
                <SectionHeader
                    title={dict.home.latestNotices}
                    hint={dict.home.sectionHintNotices}
                    viewAllHref={href(locale, "/notices")}
                    viewAllLabel={dict.home.viewAllNotices}
                />
                <NoticesList notices={data.notices} dict={dict} locale={locale} />
            </div> : null}
            {data.listings.length > 0 ? <div className="min-w-0">
                <SectionHeader
                    title={dict.home.buySell}
                    hint={dict.home.sectionHintBuySell}
                    viewAllHref={href(locale, "/buy-sell")}
                    viewAllLabel={dict.home.viewAllBuySell}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    {data.listings.map((l) => (
                        <ListingCard key={l.id} listing={l} dict={dict} locale={locale} />
                    ))}
                </div>
            </div> : null}
        </section>
    );
}

/** Culture preview. */
export async function HomeCulture({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    if (data.culture.length === 0) return null;
    return (
        <section>
            <SectionHeader
                title={dict.home.culture}
                hint={dict.home.sectionHintCulture}
                viewAllHref={href(locale, "/culture")}
                viewAllLabel={dict.home.viewAllCulture}
            />
            <div className="grid gap-5 sm:grid-cols-3">
                {data.culture.map((s) => (
                    <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                ))}
            </div>
        </section>
    );
}

/** Bottom inline ad strip. */
export async function HomeInlineBottomAd({ locale, dict }: SectionProps) {
    const data = await getHomeData(locale);
    if (!data.ads.inlineBottom) return null;
    return <AdSlot ad={data.ads.inlineBottom} dict={dict} variant="strip" />;
}

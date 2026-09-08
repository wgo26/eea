import type { Metadata } from "next";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { buildAlternates } from "@/lib/i18n/urls";
import { getHomeData } from "@/lib/queries/home";
import { HomeHero } from "@/components/home/home-hero";
import { EmptySection, StoryCard } from "@/components/home/story-card";
import { SectionHeader } from "@/components/home/section-header";
import { AdSlot } from "@/components/home/ad-slot";
import { ListingCard } from "@/components/home/listing-card";
import { NoticesList } from "@/components/home/notices-list";
import { SubmitCta } from "@/components/home/submit-cta";
import { ExploreTiles } from "@/components/home/explore-tiles";
import { TrendingList } from "@/components/home/trending-list";

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
    return {
        title: dict.meta.title,
        description: dict.meta.description,
        alternates: buildAlternates(locale, "/"),
    };
}

/**
 * Homepage (spec §1A + sitemap §2) — a hub, not a destination: every module
 * routes into one of the content verticals or into /submit.
 */
export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const data = await getHomeData(locale);
    const p = (path: string) => `/${locale}${path}`;

    return (
        <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-6 md:px-6 md:py-10">
            <HomeHero
                featured={data.featured}
                secondary={data.secondary}
                dict={dict}
                locale={locale}
                submitHref={p("/submit")}
                photoStoriesHref={p("/photo-stories")}
            />

            <AdSlot ad={data.ads.banner} dict={dict} advertiseHref={p("/advertise")} variant="banner" />

            {/* Quick navigation into every vertical (spec §1A — hub, not destination) */}
            <ExploreTiles
                dict={dict}
                hrefs={{
                    photoStories: p("/photo-stories"),
                    news: p("/news"),
                    notices: p("/notices"),
                    buySell: p("/buy-sell"),
                    culture: p("/culture"),
                    locations: p("/locations"),
                }}
            />

            {/* Latest Photo Stories + ad rail */}
            <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                    <SectionHeader
                        title={dict.home.latestPhotoStories}
                        hint={dict.home.sectionHintPhoto}
                        viewAllHref={p("/photo-stories")}
                        viewAllLabel={dict.home.viewAll}
                    />
                    {data.photoStories.length > 0 ? (
                        <div className="grid gap-5 sm:grid-cols-2">
                            {data.photoStories.map((s) => (
                                <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                            ))}
                        </div>
                    ) : (
                        <EmptySection dict={dict} href={p("/photo-stories")} label={dict.home.viewAll} />
                    )}
                </div>
                <aside>
                    <AdSlot
                        ad={data.ads.rail}
                        dict={dict}
                        advertiseHref={p("/advertise")}
                        variant="rail"
                        className="lg:sticky lg:top-24"
                    />
                </aside>
            </section>

            {/* Latest Community News + Trending rail */}
            <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0">
                    <SectionHeader
                        title={dict.home.latestNews}
                        hint={dict.home.sectionHintNews}
                        viewAllHref={p("/news")}
                        viewAllLabel={dict.home.viewAll}
                    />
                    {data.news.length > 0 ? (
                        <div className="grid gap-5 sm:grid-cols-2">
                            {data.news.map((s) => (
                                <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                            ))}
                        </div>
                    ) : (
                        <EmptySection dict={dict} href={p("/news")} label={dict.home.viewAll} />
                    )}
                </div>
                <aside>
                    <TrendingList stories={data.trending} dict={dict} locale={locale} />
                </aside>
            </section>

            {/* Inline ad — mid page (spec §11) */}
            <AdSlot ad={data.ads.inlineMid} dict={dict} advertiseHref={p("/advertise")} variant="strip" />

            {/* Notices + Buy & Sell previews (One Community Board, Diff. #4) */}
            <section className="grid gap-10 lg:grid-cols-2">
                <div className="min-w-0">
                    <SectionHeader
                        title={dict.home.latestNotices}
                        hint={dict.home.sectionHintNotices}
                        viewAllHref={p("/notices")}
                        viewAllLabel={dict.home.viewAll}
                    />
                    <NoticesList notices={data.notices} dict={dict} locale={locale} />
                </div>
                <div className="min-w-0">
                    <SectionHeader
                        title={dict.home.buySell}
                        hint={dict.home.sectionHintBuySell}
                        viewAllHref={p("/buy-sell")}
                        viewAllLabel={dict.home.viewAll}
                    />
                    {data.listings.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {data.listings.map((l) => (
                                <ListingCard key={l.id} listing={l} dict={dict} locale={locale} />
                            ))}
                        </div>
                    ) : (
                        <EmptySection dict={dict} href={p("/buy-sell")} label={dict.home.viewAll} />
                    )}
                </div>
            </section>

            {/* Culture & Entertainment preview */}
            <section>
                <SectionHeader
                    title={dict.home.culture}
                    hint={dict.home.sectionHintCulture}
                    viewAllHref={p("/culture")}
                    viewAllLabel={dict.home.viewAll}
                />
                {data.culture.length > 0 ? (
                    <div className="grid gap-5 sm:grid-cols-3">
                        {data.culture.map((s) => (
                            <StoryCard key={s.id} story={s} dict={dict} locale={locale} />
                        ))}
                    </div>
                ) : (
                    <EmptySection dict={dict} href={p("/culture")} label={dict.home.viewAll} />
                )}
            </section>

            {/* Inline ad — before the participation loop CTA (spec §11) */}
            <AdSlot ad={data.ads.inlineBottom} dict={dict} advertiseHref={p("/advertise")} variant="strip" />

            <SubmitCta dict={dict} submitHref={p("/submit")} />
        </div>
    );
}
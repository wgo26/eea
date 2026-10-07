import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { buildAlternates, localePath } from "@/lib/i18n/urls";

import { StoryCard } from "@/components/home/story-card";
import { PlaceRail } from "@/components/place/place-rail";
import { EmptyStateWithCTA } from "@/components/system/empty-state-with-cta";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getNewsArticles } from "@/lib/queries/news";
import { getPhotoStories } from "@/lib/queries/photo-stories";
import { getCultureArticles } from "@/lib/queries/culture";
import type { StoryCardData } from "@/lib/queries/home";

/**
 * P1 merged Stories feed (merged audit §5): news + photo stories + culture
 * in one feed. The legacy vertical routes (/news, /photo-stories, /culture)
 * still resolve as archive views; this page is the single advertised
 * destination (header/footer/palette/sitemap) and the canonical home of J1.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    return {
        title: dict.nav.stories,
        description: dict.news.tagline,
        alternates: buildAlternates(locale, "/stories"),
    };
}

function byNewest(a: StoryCardData, b: StoryCardData): number {
    const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return tb - ta;
}

export default async function StoriesPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    let items: StoryCardData[] = [];
    try {
        const [news, photos, culture] = await Promise.all([
            getNewsArticles({ locale, page: 1 }),
            getPhotoStories({ locale }),
            getCultureArticles({ locale }),
        ]);
        items = [...news.articles, ...photos.stories, ...culture.articles]
            .sort(byNewest)
            .slice(0, 18);
    } catch (err) {
        console.error("[stories] Data fetch failed:", err);
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <header className="mb-8">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Newspaper className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                            {dict.nav.stories}
                        </h1>
                        <p className="text-sm text-muted-foreground">{dict.news.tagline}</p>
                    </div>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.news.intro}
                </p>
            </header>

            <PlaceRail locale={locale} dict={dict} kind="news" sectionPath="/stories" />

            {items.length === 0 ? (
                <EmptyStateWithCTA
                    icon={Newspaper}
                    title={dict.news.searchLabel}
                    body={dict.news.comingSoon}
                    isFiltered={false}
                    ctaLabel={dict.news.submitCtaButton}
                    ctaHref={localePath(locale, "/submit")}
                    clearHref={localePath(locale, "/stories")}
                    clearLabel={dict.news.clearFilters}
                />
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((story) => (
                        <StoryCard
                            key={`${story.id}`}
                            story={story}
                            dict={dict}
                            locale={locale}
                        />
                    ))}
                </div>
            )}

            <nav
                aria-label={dict.nav.stories}
                className="mt-10 flex flex-wrap items-center gap-2 text-sm"
            >
                <span className="text-muted-foreground">{dict.footer.sections}:</span>
                <Link href={localePath(locale, "/news")} className="font-medium hover:underline">
                    {dict.nav.news}
                </Link>
                <span aria-hidden className="text-muted-foreground">·</span>
                <Link href={localePath(locale, "/photo-stories")} className="font-medium hover:underline">
                    {dict.nav.photoStories}
                </Link>
                <span aria-hidden className="text-muted-foreground">·</span>
                <Link href={localePath(locale, "/culture")} className="font-medium hover:underline">
                    {dict.nav.culture}
                </Link>
            </nav>
        </div>
    );
}

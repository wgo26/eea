import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";
import { StoryCard } from "@/components/home/story-card";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { HeroSlide } from "@/components/home/hero-slide";

type HomeHeroProps = {
    /** Featured slideshow queue (up to five), lead story first. */
    featured: StoryCardData[];
    /** Rail stories beyond the featured five. */
    secondary: StoryCardData[];
    dict: Dictionary;
    locale: Locale;
    submitHref: string;
    photoStoriesHref: string;
};

/**
 * Hero section (per hero.png): the featured stories crossfade with a minimal
 * overlay (kicker + headline + one badge) so the photography leads, and a
 * rail of further stories alongside.
 */
export function HomeHero({ featured, secondary, dict, locale, submitHref, photoStoriesHref }: HomeHeroProps) {
    if (featured.length === 0) {
        return (
            <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-muted p-6 sm:p-8 md:p-14">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-link">
                    {dict.home.kicker}
                </p>
                <h1 className="mt-3 max-w-2xl break-words text-2xl font-extrabold tracking-tight sm:text-3xl md:text-5xl">
                    {dict.meta.title}
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {dict.meta.description}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <Button size="lg" render={<Link href={submitHref} />}>
                        {dict.nav.submit}
                    </Button>
                    <Button size="lg" variant="outline" render={<Link href={photoStoriesHref} />}>
                        {dict.nav.photoStories}
                    </Button>
                </div>
            </section>
        );
    }

    return (
        <>
            {featured.length > 1 ? <h1 className="sr-only">{dict.meta.title}</h1> : null}
            <section className="relative grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
                {featured.length > 1 ? (
                    <div className="min-w-0">
                        <HeroCarousel stories={featured} dict={dict} locale={locale} />
                    </div>
                ) : (
                    <HeroSlide story={featured[0]} dict={dict} locale={locale} headingLevel="h1" priority />
                )}
                <aside className="flex min-w-0 flex-col gap-3">
                    {/* <aside className="flex flex-col gap-3"> */}
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        {dict.home.kicker}
                    </p>
                    {secondary.length > 0 ? (
                        secondary.map((story) => (
                            <StoryCard
                                key={story.id}
                                story={story}
                                dict={dict}
                                locale={locale}
                                variant="row"
                                className="flex-1"
                            />
                        ))
                    ) : (
                        <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                            {dict.common.comingSoon}
                        </p>
                    )}
                </aside>
            </section>
        </>
    );
}
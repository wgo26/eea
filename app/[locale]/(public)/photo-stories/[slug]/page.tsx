import type { Metadata } from "next";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Camera,
    Eye,
    Images,
    MapPin,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { StoryCard } from "@/components/home/story-card";
import { GalleryGrid } from "@/components/photo-stories/gallery-grid";
import { StoryBody } from "@/components/photo-stories/story-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButtons } from "@/components/share-buttons";
import { SITE } from "@/lib/constants";
import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import {
    generateStaticSlugs,
    getAdjacentPhotoStories,
    getOtherPhotoStories,
    getPhotoStoryBySlug,
} from "@/lib/queries/photo-stories";

type PhotoStoryPageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams(): Promise<{ slug: string }[]> {
    return generateStaticSlugs();
}

export async function generateMetadata({
    params,
}: PhotoStoryPageProps): Promise<Metadata> {
    const { slug } = await params;
    const locale = resolveLocale((await headers()).get("x-locale"));
    const story = await getPhotoStoryBySlug(slug, locale);
    if (!story) return { title: "Photo story not found" };
    return {
        title: story.title,
        description: story.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/photo-stories/${story.slug}`),
        openGraph: {
            title: story.title,
            description: story.excerpt ?? undefined,
            type: "article",
            images: story.imageUrl ? [{ url: story.imageUrl }] : undefined,
        },
    };
}

export default async function PhotoStoryPage({ params }: PhotoStoryPageProps) {
    const { slug } = await params;
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const story = await getPhotoStoryBySlug(slug, locale);
    if (!story) notFound();

    const [related, adjacent] = await Promise.all([
        getOtherPhotoStories(story.id, locale),
        getAdjacentPhotoStories(story.id, story.publishedAt ?? new Date().toISOString(), locale),
    ]);
    const badge = verificationBadgeInfo(story.verification ?? null, dict);
    const shareUrl = `${SITE.url}${localePath(locale, `/photo-stories/${story.slug}`)}`;

    return (
        <article className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/photo-stories")}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.photoStories.backToPhotoStories}
            </Link>

            {/* Editorial header */}
            <header className="mt-4 max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                    {story.category ? <Badge>{story.category}</Badge> : null}
                    {badge ? (
                        <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.className}`}
                        >
                            {badge.label}
                        </span>
                    ) : null}
                </div>
                <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl lg:text-5xl">
                    {story.title}
                </h1>
                {story.excerpt ? (
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
                        {story.excerpt}
                    </p>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <Images className="h-4 w-4 text-primary" aria-hidden />
                        <strong className="tabular-nums text-foreground">
                            {story.photos.length}
                        </strong>
                        {dict.photoStories.photosLabel}
                    </span>
                    {story.credit ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Camera className="h-4 w-4 text-primary" aria-hidden />
                            {dict.hero.by} {story.credit}
                        </span>
                    ) : null}
                    {story.location ? (
                        <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" aria-hidden />
                            {story.location}
                        </span>
                    ) : null}
                    {story.publishedAt ? (
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" aria-hidden />
                            {formatDate(story.publishedAt, locale)}
                        </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-4 w-4" aria-hidden />
                        {story.viewCount}
                    </span>
                </div>
            </header>

            {/* Essay gallery with lightbox (spec §3.2) */}
            <section className="mt-8" aria-label={dict.photoStories.gallery}>
                <GalleryGrid photos={story.photos} storyTitle={story.title} dict={dict} />
            </section>

            {/* Essay prose */}
            {story.body ? (
                <section className="mt-12" aria-label={story.title}>
                    <StoryBody body={story.body} />
                </section>
            ) : null}

            {/* Prev / next essay navigation */}
            {(adjacent.prev || adjacent.next) && story.body ? (
                <nav aria-label={dict.photoStories.nextUp} className="mt-12 border-t pt-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {adjacent.prev ? (
                            <Link
                                href={adjacent.prev.href}
                                className="group rounded-2xl border p-4 transition-colors hover:bg-muted"
                            >
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                                    {dict.photoStories.prevEssay}
                                </span>
                                <span className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                    {adjacent.prev.title}
                                </span>
                            </Link>
                        ) : (
                            <span aria-hidden />
                        )}
                        {adjacent.next ? (
                            <Link
                                href={adjacent.next.href}
                                className="group rounded-2xl border p-4 text-right transition-colors hover:bg-muted"
                            >
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                    {dict.photoStories.nextEssay}
                                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                </span>
                                <span className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                    {adjacent.next.title}
                                </span>
                            </Link>
                        ) : (
                            <span aria-hidden />
                        )}
                    </div>
                </nav>
            ) : null}

            {/* More essays + sidebar */}
            <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                    <SectionHeader
                        title={dict.photoStories.moreEssays}
                        hint={dict.home.sectionHintPhoto}
                    />
                    {related.length === 0 ? (
                        <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                            {dict.photoStories.comingSoon}
                        </p>
                    ) : (
                        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                            {related.map((item) => (
                                <StoryCard
                                    key={item.id}
                                    story={item}
                                    dict={dict}
                                    locale={locale}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <aside className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">{dict.common.share}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ShareButtons url={shareUrl} title={story.title} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {dict.photoStories.inThisStory}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="space-y-3 text-sm">
                                {story.credit ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Camera className="h-4 w-4" aria-hidden />
                                            {dict.hero.by}
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {story.credit}
                                        </dd>
                                    </div>
                                ) : null}
                                {story.location ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <MapPin className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {story.location}
                                        </dd>
                                    </div>
                                ) : null}
                                {story.publishedAt ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <CalendarDays className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {formatDate(story.publishedAt, locale)}
                                        </dd>
                                    </div>
                                ) : null}
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                        <Images className="h-4 w-4" aria-hidden />
                                    </dt>
                                    <dd className="text-right font-medium text-foreground">
                                        {story.photos.length} {dict.photoStories.photosLabel}
                                    </dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                        <Eye className="h-4 w-4" aria-hidden />
                                    </dt>
                                    <dd className="text-right font-medium tabular-nums text-foreground">
                                        {story.viewCount}
                                    </dd>
                                </div>
                            </dl>
                        </CardContent>
                    </Card>

                    <AdSlot
                        ad={null}
                        dict={dict}
                        advertiseHref="/advertise"
                        variant="rail"
                        className="lg:sticky lg:top-24"
                    />

                    <Card>
                        <CardContent className="space-y-2">
                            <p className="text-sm font-bold">
                                {dict.photoStories.submitCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.photoStories.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.photoStories.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </article>
    );
}
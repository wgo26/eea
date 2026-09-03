import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
    ArrowLeft,
    CalendarDays,
    Camera,
    Eye,
    MapPin,
    PencilLine,
    Tag,
    User,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { StoryCard } from "@/components/home/story-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButtons } from "@/components/share-buttons";
import { SITE } from "@/lib/constants";
import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import { getNewsBySlug, getOtherNews } from "@/lib/queries/news";
import { buildAlternates, localePath } from "@/lib/i18n/urls";

type NewsPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
    params,
}: NewsPageProps): Promise<Metadata> {
    const { slug } = await params;
    const locale = resolveLocale((await headers()).get("x-locale"));
    const article = await getNewsBySlug(slug, locale);
    if (!article) return { title: "News article not found" };
    return {
        title: article.title,
        description: article.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/news/${article.slug}`),
        openGraph: {
            title: article.title,
            description: article.excerpt ?? undefined,
            type: "article",
            images: article.imageUrl ? [{ url: article.imageUrl }] : undefined,
        },
    };
}

export default async function NewsArticlePage({ params }: NewsPageProps) {
    const { slug } = await params;
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);

    const article = await getNewsBySlug(slug, locale);
    if (!article) notFound();

    const related = (
        await getOtherNews(article.id, locale, 3)
    ).filter((n) => n.id !== article.id);

    const badge = verificationBadgeInfo(article.verification ?? null, dict);
    const shareUrl = `${SITE.url}/news/${article.slug}`;
    const paragraphs = (article.body ?? "")
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean);

    return (
        <article className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/news")}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.news.backToNews}
            </Link>

            {/* Editorial header */}
            <header className="mt-4 max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                    {article.category ? <Badge>{article.category}</Badge> : null}
                    {badge ? (
                        <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.className}`}
                        >
                            {badge.label}
                        </span>
                    ) : null}
                </div>
                <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl lg:text-5xl">
                    {article.title}
                </h1>
                {article.excerpt ? (
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
                        {article.excerpt}
                    </p>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-sm text-muted-foreground">
                    {article.authorName ? (
                        <span className="inline-flex items-center gap-1.5">
                            <User className="h-4 w-4 text-primary" aria-hidden />
                            {dict.news.byline}{" "}
                            {article.authorId ? (
                                <Link
                                    href={`/contributors/${article.authorId}`}
                                    className="font-medium text-foreground hover:underline"
                                >
                                    {article.authorName}
                                </Link>
                            ) : (
                                <strong className="text-foreground">
                                    {article.authorName}
                                </strong>
                            )}
                        </span>
                    ) : null}
                    {article.location ? (
                        <Link
                            href={`/locations/${article.locationSlug ?? ""}`}
                            className="inline-flex items-center gap-1.5 hover:text-foreground"
                        >
                            <MapPin className="h-4 w-4" aria-hidden />
                            {article.location}
                        </Link>
                    ) : null}
                    {article.publishedAt ? (
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" aria-hidden />
                            {dict.news.publishedOn} {formatDate(article.publishedAt, locale)}
                        </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-4 w-4" aria-hidden />
                        {article.viewCount}
                    </span>
                </div>
            </header>

            {/* Featured image */}
            {article.imageUrl ? (
                <div className="mt-8 overflow-hidden rounded-2xl bg-muted">
                    <span
                        className="block h-72 w-full bg-cover bg-center md:h-96"
                        style={{ backgroundImage: `url(${article.imageUrl})` }}
                        role="img"
                        aria-label={article.title}
                    />
                </div>
            ) : null}

            {/* Body */}
            {paragraphs.length > 0 ? (
                <section className="mt-10 max-w-4xl space-y-5 text-base leading-relaxed md:text-lg">
                    {paragraphs.map((p, i) => (
                        <p key={i}>{p}</p>
                    ))}
                </section>
            ) : null}

            <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                    {/* Report a correction */}
                    <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/40 p-4 text-sm">
                        <PencilLine className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <span className="text-muted-foreground">
                            {dict.news.correctionIntro}
                        </span>
                        <Button
                            render={<Link href={`/news/${article.slug}/correction`} />}
                            variant="outline"
                            size="sm"
                            className="ml-auto"
                        >
                            {dict.news.reportCorrection}
                        </Button>
                    </div>

                    {related.length > 0 ? (
                        <section>
                            <SectionHeader
                                title={dict.news.moreStories}
                                hint={dict.home.sectionHintNews}
                            />
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
                        </section>
                    ) : null}
                </div>

                <aside className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {dict.common.share}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ShareButtons url={shareUrl} title={article.title} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Tag className="h-4 w-4 text-muted-foreground" aria-hidden />
                                {dict.news.inThisArticle}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="space-y-3 text-sm">
                                {article.authorName ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <User className="h-4 w-4" aria-hidden />
                                            {dict.news.byline}
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {article.authorName}
                                        </dd>
                                    </div>
                                ) : null}
                                {article.category ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Tag className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {article.category}
                                        </dd>
                                    </div>
                                ) : null}
                                {article.location ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <MapPin className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {article.location}
                                        </dd>
                                    </div>
                                ) : null}
                                {article.publishedAt ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <CalendarDays className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {formatDate(article.publishedAt, locale)}
                                        </dd>
                                    </div>
                                ) : null}
                                {article.imageUrl ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Camera className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {dict.photoStories.photographBy}
                                        </dd>
                                    </div>
                                ) : null}
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
                                {dict.news.submitCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.news.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.news.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </article>
    );
}

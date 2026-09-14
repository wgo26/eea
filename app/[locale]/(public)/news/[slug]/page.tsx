import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Camera,
    Clock,
    Eye,
    MapPin,
    PencilLine,
    Quote,
    Tag,
    UserRound,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { ArticleActionRow } from "@/components/system/article-actions";
import { FeedbackWidget } from "@/components/system/feedback-widget";
import { StoryCard } from "@/components/home/story-card";
import { MediaBadge } from "@/components/media/media-attachment";
import { SmartImage } from "@/components/media/smart-image";
import { SupportingMedia } from "@/components/media/supporting-media";
import { ArticleShare } from "@/components/news/article-share";
import { CorrectionForm } from "@/components/news/correction-form";
import { ReadingProgress } from "@/components/news/reading-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SITE } from "@/lib/constants";
import { formatDate, formatDateTime, getDictionary, resolveLocale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import {
    getAdjacentNews,
    getNewsBySlug,
    getRelatedNews,
} from "@/lib/queries/news";
import { getAdForSlot } from "@/lib/queries/ads";
import { isFeatureEnabled } from "@/lib/features";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { sanitizeBodyHtml } from "@/lib/security/html";
import { extractHeadings, extractPullQuote, hasDropCapLead, withHeadingAnchors } from "@/lib/news/article-body";

type NewsPageProps = { params: Promise<{ locale: string; slug: string }> };

/**
 * Phase 4.1 (audit §4.1) — ISR for the article page, the highest-traffic
 * public route. Locale comes from the [locale] segment (no headers()/cookies()
 * read), the article data is cached under the `news` tag, and the full route
 * is revalidated on this window or on demand via revalidateTag('news', 'max')
 * from the editorial actions. The literal is required by the
 * static-analyzability rule for segment config.
 */
export const revalidate = 300;

export async function generateMetadata({
    params,
}: NewsPageProps): Promise<Metadata> {
    const { slug, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const article = await getNewsBySlug(slug, locale);
    if (!article) {
        return {
            title: locale === "fr" ? "Article introuvable" : "News article not found",
            alternates: buildAlternates(locale, "/news"),
        };
    }
    return {
        title: article.title,
        description: article.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/news/${article.slug}`),
        openGraph: {
            title: article.title,
            description: article.excerpt ?? undefined,
            type: "article",
            // Cover: served by ./opengraph-image.tsx (branded title card that
            // embeds the cover) — Next injects it automatically, so no
            // explicit images here (they would duplicate the tags).
        },
    };
}

export default async function NewsArticlePage({ params }: NewsPageProps) {
    const { slug, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    const article = await getNewsBySlug(slug, locale);
    if (!article) notFound();

    const [related, neighbours, railAd, readingModeOn, ttsOn] = await Promise.all([
        getRelatedNews(article.id, article.categoryId ?? null, locale, 3),
        article.publishedAt
            ? getAdjacentNews(article.id, article.publishedAt, locale)
            : Promise.resolve({ prev: null, next: null }),
        getAdForSlot("news-rail"),
        // Kill-switches from /admin/site-content gate the action-row extras
        // (settings read is unstable_cache-tagged, so ISR stays safe).
        isFeatureEnabled("feature_reading_mode"),
        isFeatureEnabled("feature_text_to_speech"),
    ]);
    const filtered = related.filter((n) => n.id !== article.id);
    const { prev, next } = neighbours;

    const badge = verificationBadgeInfo(article.verification ?? null, dict);
    const shareUrl = `${SITE.url}${localePath(locale, `/news/${article.slug}`)}`;
    // Blogger imports store the body as HTML — render it as sanitized rich
    // text. Native drafts are plain text and keep the blank-line split.
    const rawBody = article.body ?? "";
    const isHtmlBody = /<(p|div|br|h[1-6]|img|ul|ol|li|blockquote|figure|table|a)\b/i.test(rawBody);
    const sanitized = isHtmlBody ? sanitizeBodyHtml(rawBody) : null;
    // Enrichment: TOC anchors + pull quote are derived from the sanitized
    // HTML server-side — no new markup sources, only ids/classes.
    const headings = sanitized ? extractHeadings(sanitized) : [];
    const bodyHtml = sanitized ? withHeadingAnchors(sanitized, headings) : null;
    const pullQuote = sanitized ? extractPullQuote(sanitized, article.excerpt) : null;
    const paragraphs = isHtmlBody
        ? []
        : rawBody
              .split(/\n\n+/)
              .map((p) => p.trim())
              .filter(Boolean);
    const dropCap = !isHtmlBody && hasDropCapLead(paragraphs);
    const authorInitials = (article.authorName ?? article.byline ?? "?")
        .split(" ")
        .map((w) => w.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase();
    const authorHref = article.authorId ? localePath(locale, `/contributors/${article.authorId}`) : null;
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "NewsArticle",
                headline: article.title,
                description: article.excerpt ?? undefined,
                image: article.imageUrl ? [article.imageUrl] : undefined,
                datePublished: article.publishedAt ?? undefined,
                author: article.authorName
                    ? { "@type": "Person", name: article.authorName }
                    : undefined,
                publisher: {
                    "@type": "Organization",
                    name: "Eagle Eye Africa",
                    url: SITE.url,
                },
                mainEntityOfPage: shareUrl,
            },
            {
                "@type": "BreadcrumbList",
                itemListElement: [
                    { "@type": "ListItem", position: 1, name: dict.news.title, item: `${SITE.url}${localePath(locale, "/news")}` },
                    { "@type": "ListItem", position: 2, name: article.title, item: shareUrl },
                ],
            },
        ],
    };

    return (
        <>
        <ReadingProgress targetId="article-body" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <article className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[
                    { label: dict.nav.news, path: "/news" },
                    ...(article.category && article.categorySlug
                        ? [{ label: article.category, path: `/news?category=${article.categorySlug}` }]
                        : []),
                    { label: article.title },
                ]}
            />

            {/* Editorial header */}
            <header className="mt-6 max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                    {article.category ? (
                        article.categorySlug ? (
                            <Link href={localePath(locale, `/news?category=${article.categorySlug}`)}>
                                <Badge className="transition-colors hover:bg-primary/80">{article.category}</Badge>
                            </Link>
                        ) : (
                            <Badge>{article.category}</Badge>
                        )
                    ) : null}
                    {article.hasVideo ? <MediaBadge kind="video" /> : null}
                    {article.hasAudio ? <MediaBadge kind="audio" /> : null}
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
                {/* Byline row: avatar + name + meta + share */}
                <div className="mt-6 flex flex-col gap-4 border-y py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        {(article.authorName || article.byline) ? (
                            <>
                                <span
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary-foreground/90 dark:text-primary"
                                    aria-hidden
                                >
                                    {authorInitials}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                        {dict.news.authorBoxTitle}
                                    </span>
                                    {authorHref && article.authorName ? (
                                        <Link
                                            href={authorHref}
                                            className="block truncate text-sm font-bold text-foreground hover:underline"
                                        >
                                            {article.authorName}
                                        </Link>
                                    ) : (
                                        <strong className="block truncate text-sm text-foreground">
                                            {article.authorName ?? article.byline}
                                        </strong>
                                    )}
                                </span>
                            </>
                        ) : null}
                        <span className="ml-1 hidden h-8 w-px bg-border sm:block" aria-hidden />
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                            {article.publishedAt ? (
                                <span className="inline-flex items-center gap-1.5" title={formatDateTime(article.publishedAt, locale)}>
                                    <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                                    {formatDate(article.publishedAt, locale)}
                                </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-primary" aria-hidden />
                                {article.readingMinutes ?? 1} {dict.news.minRead}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Eye className="h-4 w-4 text-primary" aria-hidden />
                                {(article.viewCount ?? 0).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")} {dict.news.views}
                            </span>
                            {article.location ? (
                                article.locationSlug ? (
                                    <Link
                                        href={localePath(locale, `/locations/${article.locationSlug}`)}
                                        className="inline-flex items-center gap-1.5 font-medium hover:text-foreground hover:underline"
                                    >
                                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                                        {article.location}
                                    </Link>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                                        {article.location}
                                    </span>
                                )
                            ) : null}
                        </span>
                    </div>
                    <ArticleShare
                        url={shareUrl}
                        title={article.title}
                        copyLabel={dict.news.shareCopy}
                        copiedLabel={dict.news.shareCopied}
                        shareLabel={dict.news.shareNative}
                        whatsappLabel={dict.news.shareWhatsapp}
                        facebookLabel={dict.news.shareFacebook}
                        xLabel={dict.news.shareX}
                        emailLabel={dict.news.shareEmail}
                    />
                </div>
            </header>

            {/* Hero figure: optimized image + caption/credit */}
            {article.imageUrl ? (
                <figure className="mt-8 overflow-hidden rounded-3xl border bg-muted">
                    <span className="relative block aspect-[16/9] w-full overflow-hidden md:aspect-[21/9]">
                        <SmartImage
                            src={article.imageUrl}
                            alt={article.coverCaption ?? article.title}
                            sizes="(max-width: 1280px) 100vw, 1280px"
                            priority
                            className="object-cover"
                        />
                    </span>
                    {(article.coverCaption || article.coverCredit) ? (
                        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-xs text-muted-foreground md:px-5">
                            <span className="min-w-0 flex-1 leading-relaxed">
                                {article.coverCaption ?? article.title}
                            </span>
                            {article.coverCredit ? (
                                <span className="shrink-0 font-semibold">
                                    {dict.news.photoCredit}: {article.coverCredit}
                                </span>
                            ) : null}
                        </figcaption>
                    ) : null}
                </figure>
            ) : null}

            {/* Pull quote */}
            {pullQuote ? (
                <figure className="mt-8 max-w-4xl border-l-4 border-primary pl-5 md:pl-6">
                    <Quote className="h-5 w-5 text-primary" aria-hidden />
                    <blockquote className="mt-2 text-xl font-bold leading-snug tracking-tight text-balance md:text-2xl">
                        {pullQuote}
                    </blockquote>
                    <figcaption className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        {dict.news.keyQuote}
                    </figcaption>
                </figure>
            ) : null}

            {/* Body */}
            <div id="article-body" className="scroll-mt-24">
                {bodyHtml ? (
                    <div
                        className="article-body max-w-none"
                        dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                ) : paragraphs.length > 0 ? (
                    <section className="article-body max-w-none space-y-5">
                        {paragraphs.map((p, i) => (
                            <p key={i} className={i === 0 && dropCap ? "article-lead" : undefined}>{p}</p>
                        ))}
                    </section>
                ) : null}
            </div>

            {/* Tags */}
            {(article.tags ?? []).length > 0 ? (
                <div className="mt-8 flex flex-wrap items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {article.tags!.map((tag) => (
                        <span
                            key={tag.slug}
                            className="rounded-full border bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground"
                        >
                            #{tag.name}
                        </span>
                    ))}
                </div>
            ) : null}

            {/* Prev / next navigation */}
            {(prev || next) ? (
                <nav aria-label={dict.news.moreStories} className="mt-10 grid gap-3 sm:grid-cols-2">
                    {prev ? (
                        <Link
                            href={localePath(locale, `/news/${prev.slug}`)}
                            className="group flex items-center gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
                        >
                            <ArrowLeft className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                    {dict.news.prevArticle}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-sm font-bold leading-snug group-hover:underline">
                                    {prev.title}
                                </span>
                            </span>
                        </Link>
                    ) : <span aria-hidden className="hidden sm:block" />}
                    {next ? (
                        <Link
                            href={localePath(locale, `/news/${next.slug}`)}
                            className="group flex items-center justify-end gap-3 rounded-2xl border bg-card p-4 text-right transition-shadow hover:shadow-md"
                        >
                            <span className="min-w-0">
                                <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                    {dict.news.nextArticle}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-sm font-bold leading-snug group-hover:underline">
                                    {next.title}
                                </span>
                            </span>
                            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </Link>
                    ) : null}
                </nav>
            ) : null}

            {(article.attachments ?? []).length > 0 ? (
                <div className="max-w-4xl">
                    <SupportingMedia
                        items={article.attachments ?? []}
                        title={article.title}
                        heading={dict.common.supportingMedia}
                        description={dict.common.supportingMediaBody}
                    />
                </div>
            ) : null}

            <div className="no-print mt-10 border-t pt-6">
                <FeedbackWidget contentItemId={article.id} copy={dict.feedback} />
            </div>

            <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                    {/* Report a correction — inline form (no dead /correction route). */}
                    <div id="correction" className="mb-8 space-y-4 rounded-2xl border bg-muted/40 p-4 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <PencilLine className="h-4 w-4 text-muted-foreground" aria-hidden />
                            <span className="text-muted-foreground">
                                {dict.news.correctionIntro}
                            </span>
                        </div>
                        <CorrectionForm slug={article.slug} dict={dict} locale={locale} />
                    </div>

                    {filtered.length > 0 ? (
                        <section>
                            <SectionHeader
                                title={dict.news.moreStories}
                                hint={dict.news.relatedStoriesHint}
                            />
                            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                                {filtered.map((item) => (
                                    <StoryCard
                                        key={item.id}
                                        story={item}
                                        dict={dict}
                                        locale={locale}
                                        author={item.authorName ?? item.byline}
                                        readingMinutes={item.readingMinutes}
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
                            <ArticleActionRow
                                contentItemId={article.id}
                                shareUrl={shareUrl}
                                title={article.title}
                                locale={locale}
                                listenText={`${article.excerpt ?? ""}\n\n${rawBody}`}
                                showReadingMode={readingModeOn}
                                showListen={ttsOn}
                                dict={dict}
                            />
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
                                {(article.authorName || article.byline) ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <UserRound className="h-4 w-4" aria-hidden />
                                            {dict.news.byline}
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {article.authorName ?? article.byline}
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
                                {article.imageUrl && article.credit ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Camera className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {dict.photoStories.photographBy} {article.credit}
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>
                        </CardContent>
                    </Card>

                    <AdSlot
                        ad={railAd}
                        dict={dict}
                        advertiseHref={localePath(locale, "/advertise")}
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
        </>
    );
}

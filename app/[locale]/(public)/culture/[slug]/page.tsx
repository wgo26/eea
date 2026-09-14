import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Landmark, MapPin, Tag, User } from "lucide-react";

import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { ArticleActionRow } from "@/components/system/article-actions";
import { FeedbackWidget } from "@/components/system/feedback-widget";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { ReminderButton } from "@/components/events/reminder-button";
import { SupportingMedia } from "@/components/media/supporting-media";
import { CARD_SIZES, SmartImage } from "@/components/media/smart-image";
import { SITE } from "@/lib/constants";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { getCultureBySlug, getCultureArticles } from "@/lib/queries/culture";
import { buildAlternates, localePath } from "@/lib/i18n/urls";

type Props = {
    params: Promise<{ locale: string; slug: string }>;
};

/**
 * Phase 4.1 (audit §4.1) — ISR for the article page. Locale comes from the
 * [locale] segment (no headers()/cookies() read), the article data is cached
 * under the `culture` tag, and the route revalidates on this window or on
 * demand via revalidateTag('culture', 'max'). The literal is required by the
 * static-analyzability rule for segment config.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const article = await getCultureBySlug(slug, locale);
    if (!article) return { title: "Culture Story" };
    return {
        title: article.title,
        description: article.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/culture/${article.slug}`),
    };
}

export default async function CultureDetailPage({ params }: Props) {
    const { slug, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    const article = await getCultureBySlug(slug, locale);
    if (!article) notFound();

    const shareUrl = `${SITE.url}${localePath(locale, `/culture/${article.slug}`)}`;

    const { articles: related } = await getCultureArticles({
        category: undefined,
        location: article.locationSlug ?? undefined,
        locale,
        page: 1,
    });
    const relatedFiltered = related
        .filter((a) => a.id !== article.id)
        .slice(0, 3);

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[{ label: dict.nav.culture, path: "/culture" }, { label: article.title }]}
            />

            {/* Article header */}
            <article>
                <header className="mb-8">
                    {article.category ? (
                        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            {article.category}
                        </span>
                    ) : null}
                    <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">
                        {article.title}
                    </h1>
                    {article.excerpt ? (
                        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                            {article.excerpt}
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        {article.authorName ? (
                            <span className="inline-flex items-center gap-1.5">
                                <User className="h-4 w-4" aria-hidden />
                                {dict.culture.by} {article.authorName}
                            </span>
                        ) : null}
                        {article.location ? (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" aria-hidden />
                                {article.location}
                            </span>
                        ) : null}
                        {article.publishedAt ? (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4" aria-hidden />
                                {new Date(article.publishedAt).toLocaleDateString()}
                            </span>
                        ) : null}
                        {article.viewCount ? (
                            <span>{article.viewCount} {dict.culture.views}</span>
                        ) : null}
                    </div>
                </header>

                {/* Featured image */}
                {article.imageUrl ? (
                    <div className="relative mb-8 overflow-hidden rounded-3xl bg-muted">
                        <span className="relative block aspect-[16/9] w-full overflow-hidden">
                            <SmartImage
                                src={article.imageUrl}
                                alt={article.title}
                                sizes="(max-width: 1024px) 100vw, 832px"
                                priority
                                className="object-cover"
                            />
                        </span>
                    </div>
                ) : null}

                {/* Event info block */}
                {article.isEvent ? (
                    <section className="mb-8 rounded-2xl border bg-card p-6">
                        <h2 className="mb-4 text-lg font-extrabold">{dict.culture.eventDetails}</h2>
                        <dl className="grid gap-4 sm:grid-cols-2">
                            {article.eventDate ? (
                                <div className="flex items-start gap-3">
                                    <dt>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <CalendarDays className="h-4 w-4" aria-hidden />
                                        </span>
                                    </dt>
                                    <dd>
                                        <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            {dict.culture.eventDate}
                                        </span>
                                        <span className="mt-0.5 block text-sm font-semibold">
                                            {new Date(article.eventDate).toLocaleDateString(undefined, {
                                                weekday: "long",
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </span>
                                    </dd>
                                </div>
                            ) : null}
                            {article.eventTime ? (
                                <div className="flex items-start gap-3">
                                    <dt>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <Clock className="h-4 w-4" aria-hidden />
                                        </span>
                                    </dt>
                                    <dd>
                                        <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            {dict.culture.eventTime}
                                        </span>
                                        <span className="mt-0.5 block text-sm font-semibold">
                                            {article.eventTime}
                                        </span>
                                    </dd>
                                </div>
                            ) : null}
                            {article.venue ? (
                                <div className="flex items-start gap-3">
                                    <dt>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <Landmark className="h-4 w-4" aria-hidden />
                                        </span>
                                    </dt>
                                    <dd>
                                        <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            {dict.culture.venue}
                                        </span>
                                        <span className="mt-0.5 block text-sm font-semibold">
                                            {article.venue}
                                        </span>
                                    </dd>
                                </div>
                            ) : null}
                            {article.organizer ? (
                                <div className="flex items-start gap-3">
                                    <dt>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <User className="h-4 w-4" aria-hidden />
                                        </span>
                                    </dt>
                                    <dd>
                                        <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            {dict.culture.organizer}
                                        </span>
                                        <span className="mt-0.5 block text-sm font-semibold">
                                            {article.organizer}
                                        </span>
                                    </dd>
                                </div>
                            ) : null}
                            {article.ticketInfo ? (
                                <div className="flex items-start gap-3 sm:col-span-2">
                                    <dt>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <Tag className="h-4 w-4" aria-hidden />
                                        </span>
                                    </dt>
                                    <dd>
                                        <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                            {dict.culture.ticketInfo}
                                        </span>
                                        <span className="mt-0.5 block text-sm font-semibold">
                                            {article.ticketInfo}
                                        </span>
                                    </dd>
                                </div>
                            ) : null}
                        </dl>
                        {article.eventDate ? (
                            <div className="no-print mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                                <AddToCalendar
                                    title={article.title}
                                    startsAt={article.eventDate}
                                    endsAt={article.eventTime ?? null}
                                    venue={article.venue ?? null}
                                    url={shareUrl}
                                    copy={dict.calendar}
                                />
                                <ReminderButton
                                    contentItemId={article.id}
                                    eventStartsAt={article.eventDate}
                                    copy={dict.reminders}
                                />
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {/* Article body */}
                {article.body ? (
                    <div
                        className="prose prose-neutral dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: article.body }}
                    />
                ) : null}

                {(article.attachments ?? []).length > 0 ? (
                    <SupportingMedia
                        items={article.attachments ?? []}
                        title={article.title}
                        heading={dict.common.supportingMedia}
                        description={dict.common.supportingMediaBody}
                    />
                ) : null}

                {/* Share */}
                <div className="no-print mt-8 border-t pt-6">
                    <p className="mb-3 text-sm font-bold">{dict.common.share}</p>
                    <ArticleActionRow
                        contentItemId={article.id}
                        shareUrl={shareUrl}
                        title={article.title}
                        locale={locale}
                        dict={dict}
                    />
                </div>

                <div className="no-print mt-8 border-t pt-6">
                    <FeedbackWidget contentItemId={article.id} copy={dict.feedback} />
                </div>
            </article>

            {/* Related content */}
            {relatedFiltered.length > 0 ? (
                <section className="mt-12">
                    <h2 className="mb-4 text-xl font-extrabold">{dict.culture.relatedContent}</h2>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {relatedFiltered.map((item) => (
                            <Link
                                key={item.id}
                                href={item.href}
                                className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
                            >
                                {item.imageUrl ? (
                                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                                        <SmartImage
                                            src={item.imageUrl}
                                            alt={item.title}
                                            sizes={CARD_SIZES}
                                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                        />
                                    </div>
                                ) : (
                                    <div className="aspect-[4/3] bg-muted" />
                                )}
                                <div className="p-3">
                                    <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:underline">
                                        {item.title}
                                    </h3>
                                    {item.category ? (
                                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            {item.category}
                                        </span>
                                    ) : null}
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

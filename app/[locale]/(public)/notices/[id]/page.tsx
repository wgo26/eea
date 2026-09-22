import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    CalendarDays,
    Clock,
    MapPin,
    Phone,
    Share2,
    Shield,
    Users,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { SaveButton } from "@/components/system/save-button";
import { ReportButton } from "@/components/system/report-dialog";
import { TextSizeControl } from "@/components/system/text-size-control";
import { FeedbackWidget } from "@/components/system/feedback-widget";
import { SectionHeader } from "@/components/home/section-header";
import { RevealNoticeContact } from "@/components/notices/reveal-contact";
import { SmartImage, THUMB_SIZES } from "@/components/media/smart-image";
import { SupportingMedia } from "@/components/media/supporting-media";
import { TrustBadge } from "@/components/system/trust-badge";
import { FundraisingSection } from "@/components/news/fundraising-section";
import { getFundraisers, getFundraiserStats } from "@/lib/queries/fundraisers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButtons } from "@/components/share-buttons";
import { ReaderToolbar } from "@/components/system/reader-toolbar";
import { RecordRecentView } from "@/components/system/record-recent-view";
import { PrintHeader } from "@/components/system/print-header";
import { SITE } from "@/lib/constants";
import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";

import { getNoticeById, getNotices, NOTICE_TYPE_LABELS } from "@/lib/queries/notices";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import { sanitizeBodyHtml } from "@/lib/security/html";
import { articleJsonLd, breadcrumbJsonLd, renderJsonLd } from "@/lib/seo/jsonld";

type NoticePageProps = { params: Promise<{ locale: string; id: string }> };

/**
 * Phase 4.1 (audit §4.1) — ISR for the detail page. Locale comes from the
 * [locale] segment (no headers()/cookies() read), the notice data is cached
 * under the `notices` tag, and the full route is revalidated on this window
 * or on demand via revalidateTag('notices', 'max') from the editorial
 * actions. The literal is required by the static-analyzability rule for
 * segment config.
 */
export const revalidate = 300;

export async function generateMetadata({
    params,
}: NoticePageProps): Promise<Metadata> {
    const { id, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const notice = await getNoticeById(id, locale);
    if (!notice) return { title: locale === "fr" ? "Avis introuvable" : "Notice not found" };
    return {
        title: notice.title,
        description: notice.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/notices/${id}`),
        openGraph: {
            title: notice.title,
            description: notice.excerpt ?? undefined,
            type: "article",
            // Cover: served by ./opengraph-image.tsx (branded title card that
            // embeds the cover) — Next injects it automatically.
        },
    };
}

export default async function NoticePage({ params }: NoticePageProps) {
    const { id, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    const notice = await getNoticeById(id, locale);
    if (!notice) notFound();

    // Render-boundary sanitization — defense in depth over the ingestion-side
    // sanitizer. Untrusted DB HTML must never reach dangerouslySetInnerHTML.
    const bodyHtml = sanitizeBodyHtml(notice.body);

    const related = notice.noticeType
        ? (
            await getNotices({
                noticeType: notice.noticeType,
                locale,
                page: 1,
            })
        ).notices.filter((n) => n.id !== notice.id).slice(0, 4)
        : [];

    // Phase 3 — community fundraising beside urgent notices (fundraisers are
    // the natural extension of the town-square notice board: road repair,
    // medical emergencies). Shared component with the news page; empty state
    // is a quiet CTA, never a dead end.
    const [fundraisers, fundraiserStats] = await Promise.all([
        getFundraisers({ locale, limit: 3, onlyActive: true }),
        getFundraiserStats(),
    ]);

    const shareUrl = `${SITE.url}${localePath(locale, `/notices/${id}`)}`;

    const isExpired = notice.expiresAt
        ? new Date(notice.expiresAt) < new Date()
        : false;

    // Phase 3 — Article + breadcrumb structured data (rich results).
    const jsonLd = renderJsonLd([
        articleJsonLd({
            headline: notice.title,
            description: notice.excerpt,
            image: notice.imageUrl,
            datePublished: notice.publishedAt,
            url: shareUrl,
        }),
        breadcrumbJsonLd([
            { name: dict.nav.notices, url: `${SITE.url}${localePath(locale, "/notices")}` },
            { name: notice.title, url: shareUrl },
        ]),
    ]);

    return (
        <>
        {/* Phase 3 — device-local reading history. */}
        <RecordRecentView
            view={{
                id: notice.id,
                href: localePath(locale, `/notices/${id}`),
                title: notice.title,
                imageUrl: notice.imageUrl,
            }}
        />
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <article className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[{ label: dict.nav.notices, path: "/notices" }, { label: notice.title }]}
            />

            {/* Phase 3 — print attribution header (paper only; expiry matters on walls). */}
            <PrintHeader
                title={notice.title}
                dateLine={notice.publishedAt ? formatDate(notice.publishedAt, locale) : null}
                url={shareUrl}
                extra={notice.expiresAt ? `${dict.notices.expires} ${formatDate(notice.expiresAt, locale)}` : null}
            />

            <header className="mt-4 max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                    {notice.noticeType ? (
                        <Badge variant="secondary">
                            {NOTICE_TYPE_LABELS[notice.noticeType] ?? notice.noticeType}
                        </Badge>
                    ) : null}
                    <TrustBadge
                        verification={notice.isOfficial ? "official_source" : notice.verification}
                        dict={dict}
                        locale={locale}
                    />
                    {isExpired ? (
                        <Badge variant="destructive">{dict.notices.expired}</Badge>
                    ) : null}
                </div>

                <h1 className="font-display mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl lg:text-5xl">
                    {notice.title}
                </h1>

                {notice.excerpt ? (
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">
                        {notice.excerpt}
                    </p>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-sm text-muted-foreground">
                    {notice.location ? (
                        <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" aria-hidden />
                            {notice.location}
                        </span>
                    ) : null}
                    {notice.publishedAt ? (
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" aria-hidden />
                            {dict.notices.posted} {formatDate(notice.publishedAt, locale)}
                        </span>
                    ) : null}
                    {notice.expiresAt ? (
                        <span className={`inline-flex items-center gap-1.5 ${isExpired ? "text-destructive" : ""}`}>
                            <Clock className="h-4 w-4" aria-hidden />
                            {dict.notices.expires} {formatDate(notice.expiresAt, locale)}
                        </span>
                    ) : null}
                    {notice.organizationName ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Users className="h-4 w-4" aria-hidden />
                            {notice.organizationName}
                        </span>
                    ) : null}
                </div>
            </header>

            {/* Phase 3 — reader toolbar: text size, lite mode, offline save, WhatsApp. */}
            <ReaderToolbar
                path={localePath(locale, `/notices/${notice.id}`)}
                shareUrl={shareUrl}
                title={notice.title}
                saveLabel={dict.news.saveOffline}
                savedLabel={dict.news.savedOffline}
                offlineUnavailableLabel={dict.news.offlineUnavailable}
                whatsappLabel={dict.news.shareWhatsapp}
                dict={dict}
            />

            {notice.imageUrl ? (
                <div className="relative mt-8 h-64 w-full overflow-hidden rounded-2xl bg-muted md:h-96">
                    <SmartImage
                        src={notice.imageUrl}
                        alt={notice.title}
                        sizes="(max-width: 1024px) 100vw, 60vw"
                        priority
                        className="object-cover"
                    />
                </div>
            ) : null}

            {bodyHtml ? (
                <section className="mt-10 max-w-4xl">
                    <div
                        className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                </section>
            ) : null}

            {(notice.attachments ?? []).length > 0 ? (
                <div className="max-w-4xl">
                    <SupportingMedia
                        items={notice.attachments ?? []}
                        title={notice.title}
                        heading={dict.common.supportingMedia}
                        description={dict.common.supportingMediaBody}
                    />
                </div>
            ) : null}

            <div className="no-print mt-10 border-t pt-6">
                <FeedbackWidget contentItemId={notice.id} copy={dict.feedback} />
            </div>

            <div className="mt-10">
                <FundraisingSection
                    campaigns={fundraisers}
                    dict={dict}
                    locale={locale}
                    stats={fundraiserStats}
                />
            </div>

            <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                    {related.length > 0 ? (
                        <section>
                            <SectionHeader
                                title={dict.notices.relatedNotices}
                                hint={dict.home.sectionHintNotices}
                            />
                            <div className="space-y-3">
                                {related.map((item) => (
                                    <Link key={item.id} href={item.href} className="group block">
                                        <Card className="transition-shadow hover:shadow-md">
                                            <CardContent className="flex items-start gap-3 py-3">
                                                {item.imageUrl ? (
                                                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                        <SmartImage
                                                            src={item.imageUrl}
                                                            alt={item.title}
                                                            sizes={THUMB_SIZES}
                                                            className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                                                        />
                                                    </div>
                                                ) : null}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                                        {item.noticeType ? (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {NOTICE_TYPE_LABELS[item.noticeType] ?? item.noticeType}
                                                            </Badge>
                                                        ) : null}
                                                        {/* Related row: inside the card link, so no nested link. */}
                                                        <TrustBadge
                                                            verification={item.isOfficial ? "official_source" : item.verification}
                                                            dict={dict}
                                                            locale={locale}
                                                            link={false}
                                                        />
                                                    </div>
                                                    <h3 className="text-sm font-semibold leading-snug group-hover:underline line-clamp-2">
                                                        {item.title}
                                                    </h3>
                                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                                        {item.location ?? ""}
                                                        {item.location && item.publishedAt ? " · " : ""}
                                                        {item.publishedAt ? formatDate(item.publishedAt, locale) : ""}
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>

                <aside className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Share2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                                {dict.notices.shareNotice}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ShareButtons
                                url={shareUrl}
                                title={notice.title}
                                labels={{
                                    share: dict.common.share,
                                    whatsapp: dict.common.whatsapp,
                                    copyLink: dict.common.copyLink,
                                    copied: dict.common.copied,
                                }}
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <SaveButton
                                    contentItemId={notice.id}
                                    labels={{
                                        save: dict.common.saveForLater,
                                        unsave: dict.common.removeSaved,
                                        savedMessage: dict.common.savedToList,
                                        removedMessage: dict.common.removedFromList,
                                        signIn: dict.common.signInToSave,
                                    }}
                                />
                                <ReportButton contentItemId={notice.id} copy={dict.report} />
                                <TextSizeControl copy={dict.textSize} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Shield className="h-4 w-4 text-muted-foreground" aria-hidden />
                                {dict.notices.organization}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="space-y-3 text-sm">
                                {notice.organizationName ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Users className="h-4 w-4" aria-hidden />
                                            {dict.notices.organization}
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {notice.organizationName}
                                        </dd>
                                    </div>
                                ) : null}
                                {notice.location ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <MapPin className="h-4 w-4" aria-hidden />
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {notice.location}
                                        </dd>
                                    </div>
                                ) : null}
                                {notice.publishedAt ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <CalendarDays className="h-4 w-4" aria-hidden />
                                            {dict.notices.posted}
                                        </dt>
                                        <dd className="text-right font-medium text-foreground">
                                            {formatDate(notice.publishedAt, locale)}
                                        </dd>
                                    </div>
                                ) : null}
                                {notice.expiresAt ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Clock className="h-4 w-4" aria-hidden />
                                            {dict.notices.expires}
                                        </dt>
                                        <dd className={`text-right font-medium ${isExpired ? "text-destructive" : "text-foreground"}`}>
                                            {formatDate(notice.expiresAt, locale)}
                                        </dd>
                                    </div>
                                ) : null}
                                {(notice.isOfficial || notice.verification) ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Shield className="h-4 w-4" aria-hidden />
                                            {dict.home.verifiedNotice}
                                        </dt>
                                        <dd>
                                            <TrustBadge
                                                verification={notice.isOfficial ? "official_source" : notice.verification}
                                                dict={dict}
                                                locale={locale}
                                            />
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>
                        </CardContent>
                    </Card>

                    {notice.organizationName || notice.hasContact ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {dict.notices.contact}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {/* Phase 0 — gated reveal: phone/email never in SSR HTML. */}
                                <RevealNoticeContact
                                    noticeId={notice.id}
                                    organizationName={notice.organizationName}
                                    hasContact={notice.hasContact}
                                    isExpired={isExpired}
                                    labels={{
                                        reveal: dict.notices.revealContact,
                                        hide: dict.notices.hideContact,
                                        phone: dict.notices.contactPhone,
                                        email: dict.notices.contactEmail,
                                        contactViaOrganization: dict.notices.contactViaOrganization ?? dict.notices.contact,
                                        rateLimited: dict.notices.contactRateLimited,
                                        unavailable: dict.notices.contactUnavailable,
                                        loading: dict.notices.contactLoading,
                                        expiredNotice: dict.notices.expiredContactNotice,
                                        safetyHint: dict.notices.contactSafetyHint,
                                    }}
                                />
                            </CardContent>
                        </Card>
                    ) : null}

                    <AdSlot
                        ad={null}
                        dict={dict}
                        variant="rail"
                        className="lg:sticky lg:top-24"
                    />

                    <Card>
                        <CardContent className="space-y-2">
                            <p className="text-sm font-bold">
                                {dict.notices.submitCtaTitle}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {dict.notices.submitCtaBody}
                            </p>
                            <Button render={<Link href={localePath(locale, "/submit")} />} className="w-full">
                                {dict.notices.submitCtaButton}
                            </Button>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </article>
        </>
    );
}

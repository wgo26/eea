import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    ArrowLeft,
    CalendarDays,
    Clock,
    MapPin,
    Phone,
    Share2,
    Shield,
    Users,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { VerificationBadge } from "@/components/verification-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareButtons } from "@/components/share-buttons";
import { SITE } from "@/lib/constants";
import { formatDate, getDictionary, resolveLocale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import { getNoticeById, getNotices, NOTICE_TYPE_LABELS } from "@/lib/queries/notices";
import { buildAlternates, localePath } from "@/lib/i18n/urls";

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
    if (!notice) return { title: "Notice not found" };
    return {
        title: notice.title,
        description: notice.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/notices/${id}`),
        openGraph: {
            title: notice.title,
            description: notice.excerpt ?? undefined,
            type: "article",
            images: notice.imageUrl ? [{ url: notice.imageUrl }] : undefined,
        },
    };
}

export default async function NoticePage({ params }: NoticePageProps) {
    const { id, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    const notice = await getNoticeById(id, locale);
    if (!notice) notFound();

    const related = notice.noticeType
        ? (
            await getNotices({
                noticeType: notice.noticeType,
                locale,
                page: 1,
            })
        ).notices.filter((n) => n.id !== notice.id).slice(0, 4)
        : [];

    const badge = verificationBadgeInfo(notice.verification ?? null, dict);
    const shareUrl = `${SITE.url}${localePath(locale, `/notices/${id}`)}`;

    const isExpired = notice.expiresAt
        ? new Date(notice.expiresAt) < new Date()
        : false;

    return (
        <article className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <Link
                href={localePath(locale, "/notices")}
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.notices.backToNotices}
            </Link>

            <header className="mt-4 max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                    {notice.noticeType ? (
                        <Badge variant="secondary">
                            {NOTICE_TYPE_LABELS[notice.noticeType] ?? notice.noticeType}
                        </Badge>
                    ) : null}
                    {notice.isOfficial ? (
                        <VerificationBadge status="official_source" />
                    ) : notice.verification ? (
                        <VerificationBadge status={notice.verification as "verified" | "community_submission" | "official_source" | "developing"} />
                    ) : null}
                    {isExpired ? (
                        <Badge variant="destructive">{dict.notices.expired}</Badge>
                    ) : null}
                </div>

                <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl lg:text-5xl">
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

            {notice.imageUrl ? (
                <div className="mt-8 overflow-hidden rounded-2xl bg-muted">
                    <span
                        className="block h-64 w-full bg-cover bg-center md:h-96"
                        style={{ backgroundImage: `url(${notice.imageUrl})` }}
                        role="img"
                        aria-label={notice.title}
                    />
                </div>
            ) : null}

            {notice.body ? (
                <section className="mt-10 max-w-4xl">
                    <div
                        className="prose prose-neutral dark:prose-invert max-w-none text-base leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: notice.body }}
                    />
                </section>
            ) : null}

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
                                                        <span
                                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                                                            style={{
                                                                backgroundImage: `url(${item.imageUrl})`,
                                                            }}
                                                            role="img"
                                                            aria-label={item.title}
                                                        />
                                                    </div>
                                                ) : null}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                                        {item.noticeType ? (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                {NOTICE_TYPE_LABELS[item.noticeType] ?? item.noticeType}
                                                            </Badge>
                                                        ) : null}
                                                        {item.isOfficial ? (
                                                            <VerificationBadge status="official_source" />
                                                        ) : null}
                                                    </div>
                                                    <h3 className="text-sm font-semibold leading-snug group-hover:underline line-clamp-2">
                                                        {item.title}
                                                    </h3>
                                                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
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
                            <ShareButtons url={shareUrl} title={notice.title} />
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
                                {badge ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <Shield className="h-4 w-4" aria-hidden />
                                            {dict.home.verifiedNotice}
                                        </dt>
                                        <dd>
                                            <span
                                                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.className}`}
                                            >
                                                {badge.label}
                                            </span>
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
                                {notice.organizationName ? (
                                    <p className="text-sm font-medium">{notice.organizationName}</p>
                                ) : null}
                                {notice.hasContact ? (
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                        {dict.notices.contactViaOrganization ?? dict.notices.contact}
                                    </p>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : null}

                    <AdSlot
                        ad={null}
                        dict={dict}
                        advertiseHref={localePath(locale, "/advertise")}
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
    );
}

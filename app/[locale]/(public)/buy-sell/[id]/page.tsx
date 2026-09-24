import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    CalendarDays,
    MapPin,
    Tag,
} from "lucide-react";

import { AdSlot } from "@/components/home/ad-slot";
import { SectionHeader } from "@/components/home/section-header";
import { ContentBreadcrumb } from "@/components/system/content-breadcrumb";
import { RecordRecentView } from "@/components/system/record-recent-view";
import { PrintHeader } from "@/components/system/print-header";
import { StoryCard } from "@/components/home/story-card";
import { SmartImage } from "@/components/media/smart-image";
import { SupportingMedia } from "@/components/media/supporting-media";
import { RevealContact } from "@/components/buy-sell/reveal-contact";
import { PriceWatchButton } from "@/components/buy-sell/price-watch-button";
import { Badge } from "@/components/ui/badge";
import { ArticleActionRow } from "@/components/system/article-actions";
import { ContentViewBeacon } from "@/components/system/content-view-beacon";
import { RatingWidget } from "@/components/system/rating-widget";
import { MessageSellerButton } from "@/components/messages/message-seller-button";
import { SITE } from "@/lib/constants";
import { formatDate, formatPrice, getDictionary, resolveLocale, type Locale } from "@/lib/i18n";
import { buildAlternates, localePath } from "@/lib/i18n/urls";
import {
    getListingDetail,
    getSimilarListings,
    type ListingData,
} from "@/lib/queries/buy-sell";
import { getAdForSlot } from "@/lib/queries/ads";
import { breadcrumbJsonLd, productJsonLd, renderJsonLd } from "@/lib/seo/jsonld";

type ListingPageProps = { params: Promise<{ locale: string; id: string }> };

/**
 * Phase 4.1 (audit §4.1) — ISR for the listing page. Locale comes from the
 * [locale] segment (no headers()/cookies() read), the detail data is cached
 * under the `listings` tag, and the full route is revalidated on this window
 * or on demand via revalidateTag('listings', 'max'). The literal is required
 * by the static-analyzability rule for segment config.
 */
export const revalidate = 300;

export async function generateMetadata({
    params,
}: ListingPageProps): Promise<Metadata> {
    const { id, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const listing = await getListingDetail(id, locale);
    if (!listing) return { title: locale === "fr" ? "Annonce introuvable" : "Listing not found" };
    return {
        title: listing.title,
        description: listing.excerpt ?? undefined,
        alternates: buildAlternates(locale, `/buy-sell/${listing.id}`),
        openGraph: {
            title: listing.title,
            description: listing.excerpt ?? undefined,
            type: "article",
            // Cover: served by ./opengraph-image.tsx (branded title card that
            // embeds the cover) — Next injects it automatically.
        },
    };
}

/** Renders a listing as a compact card (StoryCard expects StoryCardData). */
function toCardData(listing: ListingData, locale: Locale) {
    return {
        ...listing,
        type: "listing",
        href: localePath(locale, `/buy-sell/${listing.id}`),
        credit: listing.sellerName,
    };
}

export default async function ListingPage({ params }: ListingPageProps) {
    const { id, locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    const listing = await getListingDetail(id, locale);
    if (!listing) notFound();

    const shareUrl = `${SITE.url}${localePath(locale, `/buy-sell/${listing.id}`)}`;
    const [similar, inlineAd] = await Promise.all([
        getSimilarListings(
            listing.id,
            { category: listing.category ?? undefined, locationSlug: listing.locationSlug },
            locale,
            3,
        ),
        getAdForSlot("buy-sell-inline"),
    ]);

    const photos = listing.photos ?? [];
    const [cover, ...rest] = photos;
    const isSold = listing.listingStatus === "sold";
    // Phase 3 — Product+Offer + breadcrumb structured data (rich results).
    const jsonLd = renderJsonLd([
        productJsonLd({
            name: listing.title,
            description: listing.excerpt ?? listing.body?.replace(/<[^>]*>/g, " ").slice(0, 300) ?? null,
            images: photos.map((p) => p.url),
            url: shareUrl,
            price: listing.price,
            currency: listing.currency,
            isSold,
            sellerName: listing.sellerName,
        }),
        breadcrumbJsonLd([
            { name: dict.nav.buySell, url: `${SITE.url}${localePath(locale, "/buy-sell")}` },
            { name: listing.title, url: shareUrl },
        ]),
    ]);

    return (
        <>
        <ContentViewBeacon contentId={listing.id} />
        {/* Phase 3 — device-local reading history. */}
        <RecordRecentView
            view={{
                id: listing.id,
                href: localePath(locale, `/buy-sell/${listing.id}`),
                title: listing.title,
                imageUrl: cover?.url ?? null,
            }}
        />
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            <ContentBreadcrumb
                locale={locale}
                homeLabel={dict.nav.home}
                trail={[{ label: dict.nav.buySell, path: "/buy-sell" }, { label: listing.title }]}
            />

            {/* Phase 3 — print attribution header (paper only). */}
            <PrintHeader
                title={listing.title}
                dateLine={listing.publishedAt ? formatDate(listing.publishedAt, locale) : null}
                url={shareUrl}
                extra={listing.price != null ? formatPrice(listing.price, listing.currency, locale) : null}
            />

            <div className="mt-6 grid gap-8 lg:grid-cols-2">
                {/* Photo gallery */}
                <section aria-label={dict.buySell.fieldPhotos}>
                    {cover ? (
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted">
                            <SmartImage
                                src={cover.url}
                                alt={listing.title}
                                priority
                                sizes="(max-width: 1024px) 100vw, 50vw"
                                className="object-cover"
                            />
                        </div>
                    ) : (
                        <div className="aspect-[4/3] w-full rounded-3xl bg-muted" />
                    )}
                    {rest.length > 0 ? (
                        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                            {rest.slice(0, 4).map((photo, i) => (
                                <span key={i} className="relative block aspect-square w-full overflow-hidden rounded-xl bg-muted">
                                    <SmartImage
                                        src={photo.url}
                                        alt={`${listing.title} ${i + 2}`}
                                        sizes="(max-width: 640px) 33vw, 25vw"
                                    />
                                </span>
                            ))}
                        </div>
                    ) : null}
                </section>

                {/* Details */}
                <section className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                        {listing.category ? <Badge>{listing.category}</Badge> : null}
                        {isSold ? (
                            <Badge variant="destructive">{dict.buySell.statusSold}</Badge>
                        ) : (
                            <Badge variant="secondary">{dict.buySell.statusActive}</Badge>
                        )}
                    </div>
                    <h1 className="font-display mt-3 text-2xl font-extrabold leading-tight tracking-tight md:text-3xl">
                        {listing.title}
                    </h1>
                    <p className="mt-3 text-3xl font-black text-primary">
                        {formatPrice(listing.price, listing.currency, locale)}
                    </p>

                    <dl className="mt-4 space-y-2.5 border-y py-4 text-sm">
                        {listing.location ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className="h-4 w-4" aria-hidden />
                                {listing.locationSlug ? (
                                    <Link
                                        href={localePath(locale, `/locations/${listing.locationSlug}`)}
                                        className="hover:text-foreground hover:underline"
                                    >
                                        {listing.location}
                                    </Link>
                                ) : (
                                    <span>{listing.location}</span>
                                )}
                            </div>
                        ) : null}
                        {listing.publishedAt ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <CalendarDays className="h-4 w-4" aria-hidden />
                                {dict.buySell.datePosted}{" "}
                                {formatDate(listing.publishedAt, locale)}
                            </div>
                        ) : null}
                        {listing.category ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Tag className="h-4 w-4" aria-hidden />
                                {listing.category}
                            </div>
                        ) : null}
                    </dl>

                    {listing.body ? (
                        <div className="mt-4">
                            <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                                {dict.buySell.description}
                            </h2>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                                {listing.body}
                            </p>
                        </div>
                    ) : null}

                    {/* Gated seller contact */}
                    <div className="mt-5 rounded-2xl border bg-card p-4">
                        <h2 className="mb-3 text-sm font-bold">
                            {dict.buySell.sellerInfo}
                        </h2>
                        <RevealContact
                            listingId={listing.id}
                            sellerName={listing.sellerName}
                            hasPhone={listing.hasPhone}
                            hasEmail={listing.hasEmail}
                            hasWhatsapp={listing.hasWhatsapp}
                            isActive={listing.listingStatus === "active"}
                            title={listing.title}
                            labels={{
                                reveal: dict.buySell.revealContact,
                                hide: dict.buySell.hideContact,
                                phone: dict.buySell.contactPhone,
                                email: dict.buySell.contactEmail,
                                whatsapp: dict.common.whatsapp,
                                contactSeller: dict.buySell.contactSeller,
                                rateLimited: dict.buySell.contactRateLimited,
                                unavailable: dict.buySell.contactUnavailable,
                                loading: dict.buySell.contactLoading,
                                soldNotice: dict.buySell.soldContactNotice,
                                safetyTip: dict.buySell.safetyTip,
                            }}
                        />
                    </div>

                    <div className="mt-4">
                        <ArticleActionRow
                            contentItemId={listing.id}
                            shareUrl={shareUrl}
                            title={listing.title}
                            locale={locale}
                            saveVariant="heart"
                            showTextSize={false}
                            dict={dict}
                        />
                    </div>
                    <div className="no-print mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
                        <MessageSellerButton
                            contentItemId={listing.id}
                            locale={locale}
                            copy={{
                                startConversation: dict.account.messages.startConversation,
                                signIn: dict.account.messages.signIn,
                                error: dict.account.messages.error,
                            }}
                        />
                        <RatingWidget contentItemId={listing.id} copy={dict.ratings} />
                    </div>
                    {/* Phase 3 — price-drop watch + reply expectation */}
                    {!isSold ? (
                        <div className="mt-4 space-y-1.5">
                            <PriceWatchButton
                                listingId={listing.id}
                                labels={{
                                    watch: dict.buySell.watchPrice,
                                    watching: dict.buySell.watchingPrice,
                                    watchers: dict.buySell.priceWatchers,
                                    signIn: dict.buySell.priceWatchSignIn,
                                    rateLimited: dict.buySell.priceWatchRateLimited,
                                    unavailable: dict.buySell.priceWatchUnavailable,
                                    loading: dict.buySell.contactLoading,
                                }}
                            />
                            <p className="text-center text-xs text-muted-foreground">
                                {dict.buySell.replyExpectation}
                            </p>
                        </div>
                    ) : null}
                </section>
            </div>

            {(listing.attachments ?? []).length > 0 ? (
                <SupportingMedia
                    items={listing.attachments ?? []}
                    title={listing.title}
                    heading={dict.common.supportingMedia}
                    description={dict.common.supportingMediaBody}
                />
            ) : null}

            {/* Similar listings */}
            {similar.length > 0 ? (
                <section className="mt-12">
                    <SectionHeader
                        title={dict.buySell.similarListings}
                        hint={dict.home.sectionHintBuySell}
                    />
                    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                        {similar.map((item) => (
                            <StoryCard
                                key={item.id}
                                story={toCardData(item, locale)}
                                dict={dict}
                                locale={locale}
                            />
                        ))}
                    </div>
                </section>
            ) : null}

            <AdSlot
                ad={inlineAd}
                dict={dict}
                variant="inline-bottom"
                className="mt-12"
            />
        </div>
        </>
    );
}

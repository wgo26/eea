import { SITE } from "@/lib/constants";
import { escapeJsonForLd } from "@/lib/security/html";

/**
 * Phase 3 — shared JSON-LD builders (rich results + Discover eligibility).
 *
 * News articles already emit NewsArticle+BreadcrumbList inline; every other
 * public detail type builds on these helpers so the vocabulary stays
 * identical: publisher block, breadcrumb trail, and one schema per page
 * (ImageGallery, Event, Product+Offer, Person, Place, Article).
 */

export type Crumb = { name: string; url: string };

function publisher() {
    return {
        "@type": "Organization",
        name: SITE.name,
        url: SITE.url,
    };
}

export function breadcrumbJsonLd(trail: Crumb[]): Record<string, unknown> {
    return {
        "@type": "BreadcrumbList",
        itemListElement: trail.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.name,
            item: crumb.url,
        })),
    };
}

export type ArticleJsonLdInput = {
    headline: string;
    description?: string | null;
    image?: string | null;
    datePublished?: string | null;
    authorName?: string | null;
    url: string;
};

/** Generic Article (culture essays, notices) — news keeps NewsArticle. */
export function articleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
    return {
        "@type": "Article",
        headline: input.headline,
        description: input.description ?? undefined,
        image: input.image ? [input.image] : undefined,
        datePublished: input.datePublished ?? undefined,
        author: input.authorName ? { "@type": "Person", name: input.authorName } : undefined,
        publisher: publisher(),
        mainEntityOfPage: input.url,
    };
}

export type ImageGalleryJsonLdInput = ArticleJsonLdInput & {
    photos: { url: string | null; caption?: string | null }[];
    locationName?: string | null;
};

export function imageGalleryJsonLd(input: ImageGalleryJsonLdInput): Record<string, unknown> {
    const images = input.photos.flatMap((p) =>
        p.url ? [{ "@type": "ImageObject", url: p.url, caption: p.caption ?? undefined }] : [],
    );
    return {
        "@type": "ImageGallery",
        headline: input.headline,
        description: input.description ?? undefined,
        image: input.image ? [input.image] : undefined,
        datePublished: input.datePublished ?? undefined,
        author: input.authorName ? { "@type": "Person", name: input.authorName } : undefined,
        publisher: publisher(),
        mainEntityOfPage: input.url,
        associatedMedia: images.length > 0 ? images : undefined,
        contentLocation: input.locationName
            ? { "@type": "Place", name: input.locationName }
            : undefined,
    };
}

export type EventJsonLdInput = {
    name: string;
    description?: string | null;
    image?: string | null;
    url: string;
    startDate?: string | null;
    endDate?: string | null;
    venue?: string | null;
    locationName?: string | null;
    organizerName?: string | null;
};

export function eventJsonLd(input: EventJsonLdInput): Record<string, unknown> {
    return {
        "@type": "Event",
        name: input.name,
        description: input.description ?? undefined,
        image: input.image ? [input.image] : undefined,
        url: input.url,
        startDate: input.startDate ?? undefined,
        endDate: input.endDate ?? undefined,
        eventStatus: "https://schema.org/EventScheduled",
        location: {
            "@type": "Place",
            name: input.venue ?? input.locationName ?? undefined,
            address: input.locationName ?? undefined,
        },
        organizer: input.organizerName
            ? { "@type": "Organization", name: input.organizerName }
            : publisher(),
    };
}

export type ProductJsonLdInput = {
    name: string;
    description?: string | null;
    images: (string | null)[];
    url: string;
    price?: number | null;
    currency?: string | null;
    isSold?: boolean;
    sellerName?: string | null;
};

export function productJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
    const images = input.images.filter((u): u is string => Boolean(u));
    return {
        "@type": "Product",
        name: input.name,
        description: input.description ?? undefined,
        image: images.length > 0 ? images : undefined,
        url: input.url,
        brand: { "@type": "Brand", name: SITE.name },
        offers: {
            "@type": "Offer",
            url: input.url,
            priceCurrency: input.currency ?? "XAF",
            price: input.price ?? undefined,
            availability: input.isSold
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
            seller: input.sellerName ? { "@type": "Person", name: input.sellerName } : undefined,
        },
    };
}

export type PersonJsonLdInput = {
    name: string;
    description?: string | null;
    image?: string | null;
    url: string;
    homeLocation?: string | null;
};

export function personJsonLd(input: PersonJsonLdInput): Record<string, unknown> {
    return {
        "@type": "Person",
        name: input.name,
        description: input.description ?? undefined,
        image: input.image ?? undefined,
        url: input.url,
        homeLocation: input.homeLocation
            ? { "@type": "Place", name: input.homeLocation }
            : undefined,
    };
}

export type PlaceJsonLdInput = {
    name: string;
    url: string;
    description?: string | null;
    parentName?: string | null;
};

export function placeJsonLd(input: PlaceJsonLdInput): Record<string, unknown> {
    return {
        "@type": "Place",
        name: input.name,
        url: input.url,
        description: input.description ?? undefined,
        containedInPlace: input.parentName
            ? { "@type": "Place", name: input.parentName }
            : undefined,
    };
}

/** Serializes a JSON-LD graph for dangerouslySetInnerHTML (XSS-safe). */
export function renderJsonLd(graph: Record<string, unknown>[]): string {
    return escapeJsonForLd({ "@context": "https://schema.org", "@graph": graph });
}

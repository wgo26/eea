import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";
import { getListingById, type ListingData } from "./buy-sell";

/**
 * Data access for the Trusted Professionals directory (Phase 4).
 *
 * Businesses are permanent presence (shops, services, trades) — distinct from
 * Buy & Sell classifieds, which are single items. Only `is_verified` rows are
 * ever public: verification is the product. Contact PII never leaves the
 * server in list payloads (booleans only); the detail reveal is rate-limited
 * like seller contact.
 */

export type BusinessCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  locationSlug: string | null;
  skills: string[];
  categories: string[];
  isVerified: boolean;
  isFeatured: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  websiteUrl: string | null;
  listingCount: number;
  /** Approved-review aggregate (null until the first approved review). */
  ratingAvg: number | null;
  ratingCount: number;
};

export type BusinessReview = {
  id: string;
  reviewerName: string;
  rating: number;
  body: string;
  createdAt: string;
};

export type BusinessDetail = BusinessCard & {
  instagramUrl: string | null;
  facebookUrl: string | null;
  openingHours: Record<string, string> | null;
  listings: ListingData[];
  reviews: BusinessReview[];
  /** Row owner (server-side only: drives the owner billing card). */
  ownerId: string | null;
};

type RawBusinessRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  opening_hours: Record<string, string> | null;
  skills: string[] | null;
  is_verified: boolean;
  is_featured: boolean;
  location?: { slug: string | null; name: string | null } | { slug: string | null; name: string | null }[] | null;
  categories?: { categories: { slug: string | null } | null }[] | null;
};

function hasDatabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function logCacheFailure(fn: string, err: unknown) {
  logger.warn("businesses", `${fn} failed, returning fallback`, {
    error: err instanceof Error ? err.message : String(err),
  });
}

function asOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const BUSINESS_SELECT = `id, slug, name, description, phone, email, whatsapp,
  website_url, instagram_url, facebook_url, opening_hours, skills, is_verified, is_featured,
  location:locations(slug, name),
  categories:business_categories(categories(slug))`;

type RatingAgg = { avg: number | null; count: number };

function toCard(
  row: RawBusinessRow,
  listingCount = 0,
  rating: { avg: number | null; count: number } = { avg: null, count: 0 },
): BusinessCard {
  const location = asOne(row.location);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    location: location?.name ?? null,
    locationSlug: location?.slug ?? null,
    skills: (row.skills ?? []).filter(Boolean).slice(0, 12),
    categories: ((row.categories ?? []).map((c) => c.categories?.slug).filter(Boolean) as string[]),
    isVerified: row.is_verified,
    isFeatured: row.is_featured,
    hasPhone: Boolean(row.phone),
    hasEmail: Boolean(row.email),
    hasWhatsapp: Boolean(row.whatsapp),
    websiteUrl: row.website_url,
    listingCount,
    ratingAvg: rating.avg,
    ratingCount: rating.count,
  };
}

/** Approved-review aggregates for a set of businesses (single query). */
async function ratingMap(businessIds: string[]): Promise<Record<string, RatingAgg>> {
  const map: Record<string, { avg: number | null; count: number }> = {};
  if (businessIds.length === 0) return map;
  const { data } = await createAdminClient()
    .from("business_reviews")
    .select("business_id, rating")
    .in("business_id", businessIds)
    .eq("status", "approved");
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of ((data ?? []) as { business_id: string; rating: number }[])) {
    const s = sums.get(r.business_id) ?? { sum: 0, n: 0 };
    s.sum += r.rating;
    s.n += 1;
    sums.set(r.business_id, s);
  }
  for (const [id, s] of sums) {
    map[id] = { avg: Math.round((s.sum / s.n) * 10) / 10, count: s.n };
  }
  return map;
}

const getCachedBusinesses = unstable_cache(
  async (search: string | undefined): Promise<BusinessCard[]> => {
    let query = createAdminClient()
      .from("businesses")
      .select(BUSINESS_SELECT)
      .eq("status", "active")
      .eq("is_verified", true)
      .order("is_featured", { ascending: false })
      .order("name", { ascending: true })
      .limit(60);
    if (search) {
      query = query.or(`name.ilike.*${search}*,description.ilike.*${search}*`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as RawBusinessRow[];
    const ratings = await ratingMap(rows.map((r) => r.id)).catch((): Record<string, RatingAgg> => ({}));
    return rows.map((r) => toCard(r, 0, ratings[r.id] ?? { avg: null, count: 0 }));
  },
  ["directory-businesses"],
  { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getBusinesses(options: {
  search?: string;
  locationSlug?: string;
} = {}): Promise<BusinessCard[]> {
  if (!hasDatabase()) return [];
  try {
    const rows = await getCachedBusinesses(
      options.search?.trim() ? options.search.trim().slice(0, 80) : undefined,
    );
    const loc = options.locationSlug?.trim().toLowerCase();
    return loc ? rows.filter((r) => r.locationSlug === loc || r.location?.toLowerCase() === loc) : rows;
  } catch (err) {
    logCacheFailure("getBusinesses", err);
    return [];
  }
}

const BUSINESS_DETAIL_SELECT = `${BUSINESS_SELECT}, owner_id`;

const getCachedBusinessBySlug = unstable_cache(
  async (slug: string, locale: Locale): Promise<BusinessDetail | null> => {
    const { data, error } = await createAdminClient()
      .from('businesses')
      .select(BUSINESS_DETAIL_SELECT)
      .eq('slug', slug)
      .eq('status', 'active')
      .eq('is_verified', true)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = ((data ?? []) as unknown as (RawBusinessRow & { owner_id: string | null })[])[0];
    if (!row) return null;
    // Live listings by this pro (active storefront bridge).
    const { data: links } = await createAdminClient()
      .from("listings")
      .select("content_item_id")
      .eq("business_id", row.id)
      .eq("listing_status", "active")
      .limit(12);
    const ids = ((links ?? []) as { content_item_id: string }[]).map((l) => l.content_item_id);
    const listings: ListingData[] = [];
    for (const contentId of ids) {
      const item = await getListingById(contentId, locale).catch(() => null);
      if (item) listings.push(item);
    }
    const { data: reviewRows } = await createAdminClient()
      .from("business_reviews")
      .select("id, reviewer_name, rating, body, created_at")
      .eq("business_id", row.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(10);
    const reviews = ((reviewRows ?? []) as {
      id: string; reviewer_name: string; rating: number; body: string; created_at: string
    }[]).map((r) => ({
      id: r.id,
      reviewerName: r.reviewer_name,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
    }));
    const ratings = await ratingMap([row.id]).catch((): Record<string, RatingAgg> => ({}));
    const card = toCard(row, listings.length, ratings[row.id] ?? { avg: null, count: 0 });
    return {
      ...card,
      instagramUrl: row.instagram_url,
      facebookUrl: row.facebook_url,
      openingHours: row.opening_hours,
      listings,
      reviews,
      ownerId: row.owner_id,
    };
  },
  ["directory-business-by-slug"],
  { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getBusinessBySlug(
  slug: string,
  locale: Locale = "en",
): Promise<BusinessDetail | null> {
  if (!hasDatabase()) return null;
  const clean = slug.trim().toLowerCase().slice(0, 200);
  if (!clean) return null;
  try {
    return await getCachedBusinessBySlug(clean, locale);
  } catch (err) {
    logCacheFailure("getBusinessBySlug", err);
    return null;
  }
}

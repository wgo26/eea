import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Demo ("dummy") data identifiers — the exact rows created by
 * scripts/seed-demo.mjs, scripts/seed-fundraisers.mjs, and the demo polls
 * seeded by migration 20260902000000_community_polls.sql.
 *
 * The admin dashboard's "Remove demo data" sweep (lib/admin/actions-demo.ts)
 * deletes ONLY rows matching these exact identifiers, mirroring
 * scripts/teardown-demo.mjs, so real editorial content can never be swept.
 * Keep these lists in sync with the seeders.
 */

// seed-demo.mjs — photo stories / news / notices / listings / culture
// and seed-fundraisers.mjs — fundraising campaign stories.
export const DEMO_CONTENT_SLUGS = [
  // seed-demo.mjs — photo stories
  'dawn-at-mankon-market',
  'new-nkwen-footbridge',
  'sunday-choir-bafut',
  'motorcycle-taxi-nights-bamenda',
  // seed-demo.mjs — news
  'commercial-avenue-reopens',
  'city-council-water-points',
  'bilingual-school-quiz',
  'farmers-market-prices',
  // seed-demo.mjs — notices
  'road-works-mankon-street',
  'lost-student-id-card',
  'malaria-prevention-drive',
  'youth-football-registration',
  // seed-demo.mjs — listings
  'tecno-spark-10-for-sale',
  'toyota-corolla-2008',
  'two-bedroom-flat-nkwen',
  'deep-freezer-300l',
  // seed-demo.mjs — culture
  'ngoma-festival-lineup',
  'acheke-food-review',
  'town-arts-new-gallery',
  // seed-fundraisers.mjs — fundraising campaign stories
  'fundraiser-mankon-market-drainage',
  'fundraiser-nkwen-baby-emergency',
  'fundraiser-bafut-school-roof',
]

// `${slot_key}` values created by seed-demo.mjs.
export const DEMO_AD_SLOT_KEYS = [
  'homepage-banner',
  'homepage-rail-top',
  'homepage-inline-mid',
  'homepage-inline-bottom',
]

// Demo polls seeded by migration 20260902000000_community_polls.sql.
export const DEMO_POLL_SLUGS = [
  'mankon-market-priority',
  'rainy-season-readiness',
  'what-to-cover-next',
]

// `${content_type}-${category slug}` as created by seed-demo.mjs ensureCategories().
export const DEMO_CATEGORY_SLUGS = [
  'photo_story-culture',
  'photo_story-community',
  'photo_story-infrastructure',
  'photo_story-people',
  'photo_story-everyday-africa',
  'news-community',
  'news-infrastructure',
  'news-education',
  'news-business',
  'notice-public-notice',
  'notice-road-closure',
  'notice-community-alert',
  'notice-lost-found',
  'listing-electronics',
  'listing-vehicles',
  'listing-property',
  'listing-household',
  'culture-music',
  'culture-events',
  'culture-food',
]

// Place slugs created by seed-demo.mjs ensureLocations().
export const DEMO_LOCATION_SLUGS = [
  'bamenda',
  'mankon',
  'nkwen',
  'bafut',
  'buea',
  'douala',
  'yaounde',
]

export type DemoDataCounts = {
  contentItems: number
  polls: number
  adSlots: number
}

/**
 * Count the demo rows the sweep would remove. Fail-safe: returns zeros when
 * the service-role client is unavailable (CI dry-run builds render the
 * dashboard without a backend), mirroring the guarded queries pattern.
 */
export async function getDemoDataCounts(): Promise<DemoDataCounts> {
  try {
    const admin = createAdminClient()
    const [items, polls, slots] = await Promise.all([
      admin.from('content_items').select('id', { count: 'exact', head: true }).in('slug', DEMO_CONTENT_SLUGS),
      admin.from('polls').select('id', { count: 'exact', head: true }).in('slug', DEMO_POLL_SLUGS),
      admin.from('ad_slots').select('id', { count: 'exact', head: true }).in('slot_key', DEMO_AD_SLOT_KEYS),
    ])
    return {
      contentItems: items.count ?? 0,
      polls: polls.count ?? 0,
      adSlots: slots.count ?? 0,
    }
  } catch {
    return { contentItems: 0, polls: 0, adSlots: 0 }
  }
}

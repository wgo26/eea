'use server'

import { revalidatePath } from 'next/cache'
import { assertAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEMO_AD_SLOT_KEYS,
  DEMO_CATEGORY_SLUGS,
  DEMO_CONTENT_SLUGS,
  DEMO_LOCATION_SLUGS,
  DEMO_POLL_SLUGS,
} from '@/lib/admin/demo-data'

const LOCALES = ['en', 'fr'] as const

function revalidateLocalized(path: string) {
  for (const locale of LOCALES) revalidatePath(`/${locale}${path}`)
}

export type DemoTeardownReport = {
  contentItems: number
  homepageSlots: number
  polls: number
  adCampaigns: number
  adSlots: number
  categoriesDeleted: number
  categoriesKept: number
  locationsDeleted: number
  locationsKept: number
}

export type RemoveDemoDataResult =
  | { ok: true; report: DemoTeardownReport }
  | { ok: false; error: string }

/**
 * Remove the seeded demo data from the admin UI (the in-app equivalent of
 * scripts/teardown-demo.mjs) so the site can start on real content.
 *
 * Scope is deliberately identical to the CLI script: ONLY rows matching the
 * exact demo slugs/keys in lib/admin/demo-data.ts are touched, so real
 * editorial content can never be swept. Deleting a content_item cascades
 * through translations, media, listings, notices, events, fundraisers,
 * tags, saved_content, corrections, and relationships (schema-level ON
 * DELETE CASCADE); homepage slots, ad slots/campaigns, and polls are cleared
 * explicitly because their FKs are SET NULL or standalone.
 *
 * Deliberately NOT deleted: the About/Legal policy versions (real legal
 * copy, not demo content) — same rule as the CLI script.
 *
 * Admin-only (assertAdmin); every step fails fast with a surfaced error and
 * the outcome is written to moderation_log for the audit trail.
 */
export async function removeDemoData(): Promise<RemoveDemoDataResult> {
  try {
    const { user } = await assertAdmin()
    const admin = createAdminClient()
    const report: DemoTeardownReport = {
      contentItems: 0,
      homepageSlots: 0,
      polls: 0,
      adCampaigns: 0,
      adSlots: 0,
      categoriesDeleted: 0,
      categoriesKept: 0,
      locationsDeleted: 0,
      locationsKept: 0,
    }

    // 1. Demo polls (migration-seeded). Votes/options cascade from poll_id.
    const { data: polls, error: pollsErr } = await admin
      .from('polls')
      .select('id, slug')
      .in('slug', DEMO_POLL_SLUGS)
    if (pollsErr) return { ok: false, error: `Polls: ${pollsErr.message}` }
    for (const poll of polls ?? []) {
      const { error } = await admin.from('polls').delete().eq('id', poll.id)
      if (error) return { ok: false, error: `Poll ${poll.slug}: ${error.message}` }
      report.polls++
    }

    // 2. Demo content items (cascades clean translations, media, type rows…).
    const { data: items, error: itemsErr } = await admin
      .from('content_items')
      .select('id, slug')
      .in('slug', DEMO_CONTENT_SLUGS)
    if (itemsErr) return { ok: false, error: `Content items: ${itemsErr.message}` }
    const itemIds = (items ?? []).map((r) => r.id)
    report.contentItems = itemIds.length
    if (itemIds.length > 0) {
      // 2a. Homepage slots — FK is SET NULL, clear them explicitly.
      const { data: slots, error: slotsSelErr } = await admin
        .from('homepage_slots')
        .select('id')
        .in('content_item_id', itemIds)
      if (slotsSelErr) return { ok: false, error: `Homepage slots: ${slotsSelErr.message}` }
      const slotIds = (slots ?? []).map((s) => s.id)
      if (slotIds.length > 0) {
        const { error: slotErr } = await admin.from('homepage_slots').delete().in('id', slotIds)
        if (slotErr) return { ok: false, error: `Homepage slots: ${slotErr.message}` }
        report.homepageSlots = slotIds.length
      }

      // 2b. Fundraiser rows referencing the demo campaign stories.
      const { error: fundErr } = await admin.from('fundraisers').delete().in('content_item_id', itemIds)
      if (fundErr) return { ok: false, error: `Fundraisers: ${fundErr.message}` }

      // 2c. The items themselves.
      const { error: itemErr } = await admin.from('content_items').delete().in('slug', DEMO_CONTENT_SLUGS)
      if (itemErr) return { ok: false, error: `Content items: ${itemErr.message}` }
    }

    // 3. Seeded ad slots + their campaigns (standalone tables).
    const { data: adSlots, error: adSelErr } = await admin
      .from('ad_slots')
      .select('id, slot_key')
      .in('slot_key', DEMO_AD_SLOT_KEYS)
    if (adSelErr) return { ok: false, error: `Ad slots: ${adSelErr.message}` }
    for (const slot of adSlots ?? []) {
      const { data: camps, error: campSelErr } = await admin
        .from('ad_campaigns')
        .select('id')
        .eq('ad_slot_id', slot.id)
      if (campSelErr) return { ok: false, error: `Ad campaigns (${slot.slot_key}): ${campSelErr.message}` }
      const campIds = (camps ?? []).map((c) => c.id)
      if (campIds.length > 0) {
        const { error: campErr } = await admin.from('ad_campaigns').delete().in('id', campIds)
        if (campErr) return { ok: false, error: `Ad campaigns (${slot.slot_key}): ${campErr.message}` }
        report.adCampaigns += campIds.length
      }
      const { error: slotErr } = await admin.from('ad_slots').delete().eq('id', slot.id)
      if (slotErr) return { ok: false, error: `Ad slot ${slot.slot_key}: ${slotErr.message}` }
      report.adSlots++
    }

    // 4. Seeded categories ONLY when nothing references them.
    const { data: cats, error: catsErr } = await admin
      .from('categories')
      .select('id, slug')
      .in('slug', DEMO_CATEGORY_SLUGS)
    if (catsErr) return { ok: false, error: `Categories: ${catsErr.message}` }
    for (const cat of cats ?? []) {
      const { count } = await admin
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', cat.id)
      if ((count ?? 0) > 0) {
        report.categoriesKept++
        continue
      }
      const { error } = await admin.from('categories').delete().eq('id', cat.id)
      if (error) return { ok: false, error: `Category ${cat.slug}: ${error.message}` }
      report.categoriesDeleted++
    }

    // 5. Seeded locations ONLY when nothing references them.
    const { data: locs, error: locsErr } = await admin
      .from('locations')
      .select('id, slug')
      .in('slug', DEMO_LOCATION_SLUGS)
    if (locsErr) return { ok: false, error: `Locations: ${locsErr.message}` }
    for (const loc of locs ?? []) {
      const [inItems, inBusinesses, inProfiles] = await Promise.all([
        admin.from('content_items').select('id', { count: 'exact', head: true }).eq('location_id', loc.id),
        admin.from('businesses').select('id', { count: 'exact', head: true }).eq('location_id', loc.id),
        admin.from('profiles').select('id', { count: 'exact', head: true }).eq('location_id', loc.id),
      ])
      if ((inItems.count ?? 0) + (inBusinesses.count ?? 0) + (inProfiles.count ?? 0) > 0) {
        report.locationsKept++
        continue
      }
      const { error } = await admin.from('locations').delete().eq('id', loc.id)
      if (error) return { ok: false, error: `Location ${loc.slug}: ${error.message}` }
      report.locationsDeleted++
    }

    // Audit trail (best-effort — never blocks the sweep result).
    const summary = `content=${report.contentItems} polls=${report.polls} ads=${report.adSlots} categories=${report.categoriesDeleted} locations=${report.locationsDeleted}`
    await admin.from('moderation_log').insert({
      action: 'demo:data:remove',
      actor_id: user.id,
      notes: summary,
    })

    revalidateLocalized('/')
    revalidateLocalized('/admin/dashboard')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/listings')
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/admin/ads')
    revalidateLocalized('/admin/taxonomy')

    return { ok: true, report }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not remove the demo data.' }
  }
}

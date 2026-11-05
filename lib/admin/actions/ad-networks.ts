'use server'

import { assertCapability } from '@/lib/admin/auth'
import { adUnitFromRow } from '@/lib/ads/networks'
import { isAdTagOriginAllowed } from '@/lib/security/csp'
import { type ActionResult, audit, fail, revalidateLocalized, revalidateAdsCache } from './_shared'

/**
 * Remnant-network configuration mutations (capability `manageAds`).
 *
 * The DB, not the client bundle, is the source of truth: `ad_slots.network_*`
 * plus the single `ad_network_settings` row are what `lib/queries/ad-networks.ts`
 * serves to the renderer. Every write is validated through the same pure parser
 * the renderer uses (`adUnitFromRow` → `parseUnit`), so a saved row can never be
 * something the client would refuse to render — and the migration's constraints
 * back it at the data layer.
 *
 * Each mutation audits and busts the `ads` cache, so a change is live on the next
 * public page render without a deploy.
 */

export async function updateAdNetworkSettings(input: {
  networksEnabled: boolean
  consentRequired: boolean
  reserveSpace: boolean
  houseAdsEnabled: boolean
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase
      .from('ad_network_settings')
      .update({
        networks_enabled: Boolean(input.networksEnabled),
        consent_required: Boolean(input.consentRequired),
        reserve_space: Boolean(input.reserveSpace),
        house_ads_enabled: Boolean(input.houseAdsEnabled),
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:network:settings',
      entityType: 'ad_network_settings',
      notes: `networks=${input.networksEnabled} consent=${input.consentRequired} reserve=${input.reserveSpace} house=${input.houseAdsEnabled}`,
    })
    revalidateAdsCache()
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type SaveAdSlotNetworkInput = {
  slotId: string
  network: string
  format: string
  kind: string
  url: string
  width?: number | null
  height?: number | null
  active: boolean
  adsenseClient?: string | null
  adsenseSlotId?: string | null
  adsenseFormat?: string | null
  adsenseLayout?: string | null
}

export async function saveAdSlotNetwork(input: SaveAdSlotNetworkInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { data: slotRows, error: slotError } = await supabase
      .from('ad_slots')
      .select('slot_key')
      .eq('id', input.slotId)
      .limit(1)
    if (slotError) return { ok: false, error: slotError.message }
    const slotKey = ((slotRows ?? [])[0] as { slot_key: string } | undefined)?.slot_key
    if (!slotKey) return { ok: false, error: 'Slot not found.' }

    // Validate through the renderer's own parser; the parsed unit is what gets
    // stored, so clamping and URL normalization match the render path exactly.
    const unit = adUnitFromRow(slotKey, {
      network: input.network,
      network_format: input.format,
      network_kind: input.kind,
      network_url: input.url.trim(),
      network_width: input.width ?? null,
      network_height: input.height ?? null,
      network_active: input.active,
      adsense_client: input.adsenseClient?.trim() || null,
      adsense_slot: input.adsenseSlotId?.trim() || null,
      adsense_format: input.adsenseFormat?.trim() || null,
      adsense_layout: input.adsenseLayout?.trim() || null,
    })
    if (!unit) {
      return {
        ok: false,
        error:
          'This tag is not valid: the URL must be https://, the format must be supported, and an AdSense unit needs both client and slot ids.',
      }
    }
    if (!isAdTagOriginAllowed(unit.url)) {
      let origin = 'the tag host'
      try {
        origin = new URL(unit.url).origin
      } catch {
        // The shared tag parser already validated the URL.
      }
      return {
        ok: false,
        error: `${origin} is not allowed by the deployed Content Security Policy. Add it to CSP_AD_EXTRA_HOSTS and redeploy before saving this tag.`,
      }
    }

    const { error } = await supabase
      .from('ad_slots')
      .update({
        network: unit.network,
        network_format: unit.format,
        network_kind: unit.kind,
        network_url: unit.url,
        network_width: unit.width,
        network_height: unit.height,
        network_active: input.active,
        adsense_client: unit.adsense?.client ?? null,
        adsense_slot: unit.adsense?.adSlot ?? null,
        adsense_format: unit.adsense?.format ?? null,
        adsense_layout: unit.adsense?.layout ?? null,
      })
      .eq('id', input.slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:network:save',
      entityType: 'ad_slot',
      entityId: input.slotId,
      notes: `${slotKey} ${unit.network}/${unit.format}`,
    })
    revalidateAdsCache()
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
export async function toggleAdSlotNetwork(slotId: string, active: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase
      .from('ad_slots')
      .update({ network_active: active })
      .eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:network:toggle',
      entityType: 'ad_slot',
      entityId: slotId,
      toStatus: active ? 'active' : 'inactive',
    })
    revalidateAdsCache()
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Removes the tag for a slot; a sold campaign or the house card takes over. */
export async function clearAdSlotNetwork(slotId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase
      .from('ad_slots')
      .update({
        network: null,
        network_format: null,
        network_kind: null,
        network_url: null,
        network_width: null,
        network_height: null,
        network_attributes: {},
        network_active: true,
        adsense_client: null,
        adsense_slot: null,
        adsense_format: null,
        adsense_layout: null,
      })
      .eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:network:clear',
      entityType: 'ad_slot',
      entityId: slotId,
    })
    revalidateAdsCache()
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
import 'server-only'

import { db, hasDatabase, safe } from './shared'

/**
 * Admin reads for the remnant-network tab.
 *
 * Kept separate from `people.ts#getAdSlots` on purpose: that query is the
 * campaign queue (joins campaigns, creatives and events) and is already close to
 * the god-file size cap; this one is a flat, cheap list of the network columns
 * added by migration `20261205000000_ad_network_config.sql`.
 */

export type AdSlotNetworkRow = {
  id: string
  slotKey: string
  name: string
  placement: string | null
  dimensions: string | null
  isActive: boolean
  network: string | null
  format: string | null
  kind: string | null
  url: string | null
  width: number | null
  height: number | null
  networkActive: boolean
  adsenseClient: string | null
  adsenseSlotId: string | null
  adsenseFormat: string | null
  adsenseLayout: string | null
}

export type AdNetworkSettingsRow = {
  networksEnabled: boolean
  consentRequired: boolean
  reserveSpace: boolean
  houseAdsEnabled: boolean
}

/** Mirrors the DB defaults so the UI renders before the single row is read. */
export const DEFAULT_AD_NETWORK_SETTINGS: AdNetworkSettingsRow = {
  networksEnabled: true,
  consentRequired: true,
  reserveSpace: true,
  houseAdsEnabled: true,
}

export async function getAdNetworkSettings(): Promise<AdNetworkSettingsRow> {
  if (!hasDatabase()) return DEFAULT_AD_NETWORK_SETTINGS
  const { data } = await safe(
    db()
      .from('ad_network_settings')
      .select('networks_enabled, consent_required, reserve_space, house_ads_enabled')
      .limit(1),
  )
  const row = ((data ?? []) as unknown as {
    networks_enabled: boolean
    consent_required: boolean
    reserve_space: boolean
    house_ads_enabled: boolean
  }[])[0]
  if (!row) return DEFAULT_AD_NETWORK_SETTINGS
  return {
    networksEnabled: row.networks_enabled,
    consentRequired: row.consent_required,
    reserveSpace: row.reserve_space,
    houseAdsEnabled: row.house_ads_enabled,
  }
}

/** Every placement, with whatever network tag the database holds for it. */
export async function getAdSlotNetworkRows(): Promise<AdSlotNetworkRow[]> {
  if (!hasDatabase()) return []
  const { data } = await safe(
    db()
      .from('ad_slots')
      .select(
        'id, slot_key, name, placement, dimensions, is_active, network, network_format, network_kind, network_url, network_width, network_height, network_active, adsense_client, adsense_slot, adsense_format, adsense_layout',
      )
      .order('slot_key', { ascending: true }),
  )
  return ((data ?? []) as unknown as {
    id: string
    slot_key: string
    name: string
    placement: string | null
    dimensions: string | null
    is_active: boolean
    network: string | null
    network_format: string | null
    network_kind: string | null
    network_url: string | null
    network_width: number | null
    network_height: number | null
    network_active: boolean
    adsense_client: string | null
    adsense_slot: string | null
    adsense_format: string | null
    adsense_layout: string | null
  }[]).map((row) => ({
    id: row.id,
    slotKey: row.slot_key,
    name: row.name,
    placement: row.placement,
    dimensions: row.dimensions,
    isActive: row.is_active,
    network: row.network,
    format: row.network_format,
    kind: row.network_kind,
    url: row.network_url,
    width: row.network_width,
    height: row.network_height,
    networkActive: row.network_active,
    adsenseClient: row.adsense_client,
    adsenseSlotId: row.adsense_slot,
    adsenseFormat: row.adsense_format,
    adsenseLayout: row.adsense_layout,
  }))
}

export async function getAdNetworkOverview(): Promise<{
  settings: AdNetworkSettingsRow
  rows: AdSlotNetworkRow[]
}> {
  const [settings, rows] = await Promise.all([getAdNetworkSettings(), getAdSlotNetworkRows()])
  return { settings, rows }
}
import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import {
    adUnitFromRow,
    getAdUnit,
    parseAdNetworkConfig,
    type AdNetworkConfig,
    type AdUnit,
} from "@/lib/ads/networks";

/**
 * Public ad runtime config, resolved from Postgres (not from the client bundle).
 *
 * `ad_slots.network_*` + the single `ad_network_settings` row are the source of
 * truth; `/admin/ads` writes them. `NEXT_PUBLIC_AD_SLOTS` is still read as a
 * bootstrap/fallback so an environment without the migration (or without a DB)
 * keeps working exactly as before — the database simply wins per slot key when
 * a row is configured.
 *
 * Cached under the `ads` tag (invalidated by every ad mutation through
 * `revalidateAdsCache()`), with the same 5-minute backstop as the campaign
 * reads, so a tag change in the admin lands without a deploy.
 */

type SettingsRow = {
    networks_enabled: boolean;
    consent_required: boolean;
    reserve_space: boolean;
    house_ads_enabled: boolean;
};

type SlotNetworkRow = {
    slot_key: string;
    network: string | null;
    network_format: string | null;
    network_kind: string | null;
    network_url: string | null;
    network_width: number | null;
    network_height: number | null;
    network_attributes: unknown;
    network_active: boolean;
    adsense_client: string | null;
    adsense_slot: string | null;
    adsense_format: string | null;
    adsense_layout: string | null;
};

/** The env-only config: bootstrap and fallback. */
function envConfig(): AdNetworkConfig {
    return parseAdNetworkConfig({
        rawJson: process.env.NEXT_PUBLIC_AD_SLOTS,
        enabledFlag: process.env.NEXT_PUBLIC_ADS_ENABLED,
        consentFlag: process.env.NEXT_PUBLIC_AD_CONSENT_REQUIRED,
        reserveFlag: process.env.NEXT_PUBLIC_AD_RESERVE_SPACE,
        houseFlag: process.env.NEXT_PUBLIC_AD_HOUSE_ADS,
    });
}

function hasDatabase(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The migration has not been applied yet — the expected state on a fresh
 * install, and not an incident. PostgREST answers "Could not find the table
 * 'public.ad_network_settings' in the schema cache" / "does not exist" for it.
 * Detecting this separately keeps the fallback from spamming error logs (and
 * Sentry) once per prerendered page during a build.
 */
function isMissingSchema(message: string): boolean {
    return /schema cache|does not exist|undefined table/i.test(message);
}

let warnedAboutMissingSchema = false;

const getCachedAdNetworkConfig = unstable_cache(
    async (): Promise<AdNetworkConfig> => {
        const supabase = createAdminClient();
        const [settingsRes, slotsRes] = await Promise.all([
            supabase
                .from("ad_network_settings")
                .select("networks_enabled, consent_required, reserve_space, house_ads_enabled")
                .limit(1),
            supabase
                .from("ad_slots")
                .select(
                    "slot_key, network, network_format, network_kind, network_url, network_width, network_height, network_attributes, network_active, adsense_client, adsense_slot, adsense_format, adsense_layout",
                )
                .not("network_url", "is", null),
        ]);
        if (settingsRes.error) throw new Error(settingsRes.error.message);
        if (slotsRes.error) throw new Error(slotsRes.error.message);

        const settings = ((settingsRes.data ?? [])[0] ?? null) as SettingsRow | null;
        const env = envConfig();

        // DB units win per slot key; env entries survive for slots the database
        // has not configured (e.g. a staging host pointed at the same project).
        const units: Record<string, AdUnit> = { ...env.units };
        for (const row of (slotsRes.data ?? []) as unknown as SlotNetworkRow[]) {
            const unit = adUnitFromRow(row.slot_key, row);
            if (unit) units[row.slot_key] = unit;
            else delete units[row.slot_key];
        }

        return {
            enabled: settings ? settings.networks_enabled : env.enabled,
            consentRequired: settings ? settings.consent_required : env.consentRequired,
            reserveSpace: settings ? settings.reserve_space : env.reserveSpace,
            houseAds: settings ? settings.house_ads_enabled : env.houseAds,
            units,
        };
    },
    ["ad-network-config"],
    { tags: [CACHE_TAGS.ads], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/**
 * Never throws: a missing migration, an empty table or a database outage all
 * resolve to the env config, so a public page can never fail because ads did.
 */
export async function getAdNetworkConfig(): Promise<AdNetworkConfig> {
    const fallback = envConfig();
    if (!hasDatabase()) return fallback;
    try {
        const config = await getCachedAdNetworkConfig();
        // `enabled` also requires at least one unit: settings can be "on" while
        // every slot is still unconfigured, and the renderer must not treat
        // that as live inventory.
        return { ...config, enabled: config.enabled && Object.keys(config.units).length > 0 };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMissingSchema(message)) {
            if (!warnedAboutMissingSchema) {
                warnedAboutMissingSchema = true;
                logger.warn("ads", "ad network tables missing — using env fallback (apply 20261205000000)", {
                    error: message,
                });
            }
        } else {
            logger.error("ads", "network config read failed — using env fallback", { error: message });
        }
        return fallback;
    }
}

/** One slot's unit from the resolved runtime config (used by tests/previews). */
export function pickAdUnit(config: AdNetworkConfig, slotKey: string): AdUnit | null {
    return getAdUnit(slotKey, config);
}
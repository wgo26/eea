import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { AdFormat } from "@/lib/ads/creatives";

/**
 * Public ad serving (masterpiece ads).
 *
 * One row per slot: the newest active campaign inside its date window whose
 * slot is itself active. Custom creative (image/video/audio/html) renders
 * only when `creative_status = 'approved'` — anything else falls back to the
 * campaign's text card (name + copy), so unmoderated uploads can never buy
 * pixels.-integrity: destination URLs are https-only; anything else renders
 * without a link.
 */

export type AdCreative = {
    id: string;
    slotKey: string;
    name: string;
    copyText: string | null;
    /** @deprecated Kept for compat — prefer imageUrl/videoUrl/audioUrl/html. */
    imageUrl: string | null;
    destinationUrl: string | null;
    creativeType: AdFormat;
    desktopUrl: string | null;
    mobileUrl: string | null;
    posterUrl: string | null;
    html: string | null;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
};

type RawAdRow = {
    id: string;
    name: string;
    copy_text: string | null;
    destination_url: string | null;
    creative_type: string | null;
    creative_html: string | null;
    creative_width: number | null;
    creative_height: number | null;
    creative_status: string | null;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string;
    slot: { slot_key: string } | { slot_key: string }[] | null;
    creative: { public_url: string | null; kind: string | null; mime_type: string | null; duration_seconds: number | null } | { public_url: string | null; kind: string | null; mime_type: string | null; duration_seconds: number | null }[] | null;
    mobile_creative: { public_url: string | null; duration_seconds: number | null } | { public_url: string | null; duration_seconds: number | null }[] | null;
    poster: { public_url: string | null } | { public_url: string | null }[] | null;
};

function asOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function httpsOrNull(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    return /^https:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

function toCreative(row: RawAdRow): AdCreative | null {
    const slot = asOne(row.slot);
    if (!slot?.slot_key) return null;
    const creative = asOne(row.creative);
    const mobile = asOne(row.mobile_creative);
    const poster = asOne(row.poster);
    const approved = row.creative_status === 'approved';
    const type: AdFormat =
        row.creative_type === 'image' || row.creative_type === 'video' || row.creative_type === 'audio' || row.creative_type === 'html'
            ? row.creative_type
            : 'sponsored';
    const desktopUrl = approved ? httpsOrNull(creative?.public_url) : null;
    return {
        id: row.id,
        slotKey: slot.slot_key,
        name: row.name,
        copyText: row.copy_text,
        imageUrl: type === 'image' ? desktopUrl : null,
        destinationUrl: httpsOrNull(row.destination_url),
        creativeType: desktopUrl || (type === 'html' && approved && row.creative_html) ? type : 'sponsored',
        desktopUrl,
        mobileUrl: approved ? httpsOrNull(mobile?.public_url) : null,
        posterUrl: approved ? httpsOrNull(poster?.public_url) : null,
        html: type === 'html' && approved ? row.creative_html : null,
        durationSeconds:
            (creative?.duration_seconds ?? mobile?.duration_seconds ?? null) as number | null,
        width: row.creative_width,
        height: row.creative_height,
    };
}

function inWindow(row: RawAdRow, now: number): boolean {
    if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
    if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
    return true;
}

const AD_SELECT = `id, name, copy_text, destination_url, creative_type, creative_html,
    creative_width, creative_height, creative_status, starts_at, ends_at, created_at,
    slot:ad_slots!inner(slot_key, is_active),
    creative:media_assets!ad_campaigns_creative_media_id_fkey(public_url, kind, mime_type, duration_seconds),
    mobile_creative:media_assets!ad_campaigns_mobile_creative_media_id_fkey(public_url, duration_seconds),
    poster:media_assets!ad_campaigns_poster_media_id_fkey(public_url)`;

/**
 * Active campaigns per slot, cached under the `ads` tag (5-minute backstop,
 * on-demand invalidation from every ad mutation). Date windows are evaluated
 * inside the cached scope against the render time.
 */
const getCachedAds = unstable_cache(
    async (slotKeys: string[]): Promise<Record<string, AdCreative>> => {
        const { data, error } = await createAdminClient()
            .from("ad_campaigns")
            .select(AD_SELECT)
            .eq("status", "active")
            .in("slot.slot_key", slotKeys);
        if (error) throw new Error(error.message);
        const now = Date.now();
        const assigned: Record<string, AdCreative> = {};
        // Newest campaign first so a fresh booking wins the slot; an
        // approved-creative campaign is preferred over a text fallback.
        const rows = ((data ?? []) as unknown as RawAdRow[])
            .filter((r) => {
                const slot = asOne(r.slot) as { slot_key: string; is_active: boolean } | null;
                return slot?.is_active !== false && inWindow(r, now);
            })
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        for (const row of rows) {
            const slot = asOne(row.slot);
            const key = slot?.slot_key;
            if (!key || assigned[key]) continue;
            const creative = toCreative(row);
            if (!creative) continue;
            if (!assigned[key]) assigned[key] = creative;
        }
        // Second pass: prefer approved custom creative over older text cards.
        for (const row of rows) {
            const slot = asOne(row.slot);
            const key = slot?.slot_key;
            if (!key) continue;
            const current = assigned[key];
            if (current && current.creativeType !== 'sponsored') continue;
            const creative = toCreative(row);
            if (creative && creative.creativeType !== 'sponsored') assigned[key] = creative;
        }
        return assigned;
    },
    ["ads-by-slot"],
    { tags: [CACHE_TAGS.ads], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

function hasDatabase(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Creatives for several slots at once (homepage). Never throws — {} on outage. */
export async function getAdsForSlots(slotKeys: string[]): Promise<Record<string, AdCreative>> {
    if (!hasDatabase() || slotKeys.length === 0) return {};
    try {
        return await getCachedAds([...slotKeys].sort());
    } catch (err) {
        logger.error("ads", "cached query failed", { error: err instanceof Error ? err.message : String(err) });
        return {};
    }
}

/** One slot's creative (detail-page rails). Null when empty or on outage. */
export async function getAdForSlot(slotKey: string): Promise<AdCreative | null> {
    const all = await getAdsForSlots([slotKey]);
    return all[slotKey] ?? null;
}

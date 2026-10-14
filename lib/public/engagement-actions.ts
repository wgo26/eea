"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getSessionUser } from "@/lib/auth/guards";
import type { ReactionKind, ReactionState } from "@/lib/public/types";
import { REACTION_KINDS } from "@/lib/public/types";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isCurrentRequestIpBlocked } from "@/lib/security/ip-blocklist";
import { RATE_LIMITS } from "./abuse";

export type PriceWatchState = { watching: boolean; watchers: number };

/**
 * Phase 3 — price-drop alerts for marketplace savers.
 * Toggle a watch on a live listing; staff price drops (updateListing) notify
 * all watchers via the existing `listing.update` outbox event. Watching
 * requires sign-in (watch rows are keyed by user id).
 */
export async function getPriceWatchState(listingId: string): Promise<PriceWatchState> {
    try {
        const { user } = await getSessionUser();
        const supabase = createAdminClient();
        const { count } = await supabase
            .from("price_watches")
            .select("user_id", { count: "exact", head: true })
            .eq("content_item_id", listingId);
        if (!user) return { watching: false, watchers: count ?? 0 };
        const { data } = await supabase
            .from("price_watches")
            .select("content_item_id")
            .eq("user_id", user.id)
            .eq("content_item_id", listingId)
            .limit(1);
        return { watching: ((data as unknown[])?.length ?? 0) > 0, watchers: count ?? 0 };
    } catch {
        return { watching: false, watchers: 0 };
    }
}

export async function togglePriceWatch(
    listingId: string,
): Promise<{ ok: true; watching: boolean } | { ok: false; error: string }> {
    if (!listingId || typeof listingId !== "string") return { ok: false, error: "not_found" };
    const identifier = listingId.trim().slice(0, 80);
    if (!identifier) return { ok: false, error: "not_found" };
    if (await isCurrentRequestIpBlocked()) return { ok: false, error: "rate_limited" };
    const limited = await checkRateLimit("public:price_watch", {
        ...RATE_LIMITS.watch,
        policy: "fail-closed",
    });
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    try {
        const { user } = await getSessionUser();
        if (!user) return { ok: false, error: "auth" };
        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("price_watches")
            .select("content_item_id")
            .eq("user_id", user.id)
            .eq("content_item_id", identifier)
            .limit(1);
        const isWatching = ((existing as unknown[])?.length ?? 0) > 0;
        const { error } = isWatching
            ? await supabase.from("price_watches").delete().eq("user_id", user.id).eq("content_item_id", identifier)
            : await supabase.from("price_watches").insert({ user_id: user.id, content_item_id: identifier });
        if (error) {
            logger.error("priceWatch", "toggle failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true, watching: !isWatching };
    } catch (err) {
        logger.error("priceWatch", "exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/* ------------------------------------------------------------------ */
/* Content reactions (W20, spec §16 first slice)                        */
/* ------------------------------------------------------------------ */

const EMPTY_REACTIONS: ReactionState = { likes: 0, helpful: 0, mine: [] };

function cleanReactionToken(token: unknown): string | null {
    if (typeof token !== "string") return null;
    const t = token.trim();
    return /^[A-Za-z0-9-]{8,64}$/.test(t) ? t : null;
}

function cleanContentId(id: unknown): string | null {
    if (typeof id !== "string") return null;
    const t = id.trim().slice(0, 80);
    return t ? t : null;
}

/**
 * Reaction tallies + the caller's own taps for a content item. Anonymous:
 * identity is the browser-held reactor token (mirrors poll voter_token).
 * Never throws — outage callers render the empty state.
 */
export async function getContentReactionState(
    contentItemId: string,
    reactorToken: string | null,
): Promise<ReactionState> {
    const identifier = cleanContentId(contentItemId);
    if (!identifier) return EMPTY_REACTIONS;
    const token = cleanReactionToken(reactorToken);
    try {
        const supabase = createAdminClient();
        // Tallies via exact head-counts on the table (not the aggregate view:
        // views are only typed when the generator runs against a live schema,
        // so view reads would break `tsc` on DDL-only regeneration).
        const [likeRes, helpfulRes] = await Promise.all([
            supabase
                .from("content_reactions")
                .select("id", { count: "exact", head: true })
                .eq("content_item_id", identifier)
                .eq("kind", "like"),
            supabase
                .from("content_reactions")
                .select("id", { count: "exact", head: true })
                .eq("content_item_id", identifier)
                .eq("kind", "helpful"),
        ]);
        const state: ReactionState = {
            likes: likeRes.count ?? 0,
            helpful: helpfulRes.count ?? 0,
            mine: [],
        };
        if (token) {
            const { data: mine } = await supabase
                .from("content_reactions")
                .select("kind")
                .eq("content_item_id", identifier)
                .eq("reactor_token", token);
            state.mine = ((mine ?? []) as { kind: string }[])
                .map((r) => r.kind)
                .filter((k): k is ReactionKind => (REACTION_KINDS as readonly string[]).includes(k));
        }
        return state;
    } catch {
        return EMPTY_REACTIONS;
    }
}

/**
 * Toggle one reaction tap. Rate-limited fail-closed (writes must not sail
 * through a limiter outage); the unique constraint makes double-taps safe.
 */
export async function toggleContentReaction(
    contentItemId: string,
    kind: string,
    reactorToken: string,
): Promise<{ ok: true; state: ReactionState } | { ok: false; error: string }> {
    const identifier = cleanContentId(contentItemId);
    const token = cleanReactionToken(reactorToken);
    if (!identifier || !token) return { ok: false, error: "invalid" };
    if (!(REACTION_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "invalid" };
    if (await isCurrentRequestIpBlocked()) return { ok: false, error: "rate_limited" };
    const limited = await checkRateLimit("public:reactions", {
        ...RATE_LIMITS.reactions,
        policy: "fail-closed",
    });
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    try {
        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("content_reactions")
            .select("id")
            .eq("content_item_id", identifier)
            .eq("kind", kind)
            .eq("reactor_token", token)
            .limit(1);
        const tapped = ((existing as unknown[])?.length ?? 0) > 0;
        const { error } = tapped
            ? await supabase
                  .from("content_reactions")
                  .delete()
                  .eq("content_item_id", identifier)
                  .eq("kind", kind)
                  .eq("reactor_token", token)
            : await supabase.from("content_reactions").insert({
                  content_item_id: identifier,
                  kind,
                  reactor_token: token,
              });
        if (error) {
            // 23505 = lost the double-tap race — re-read instead of failing.
            if (!tapped && error.code === "23505") {
                return { ok: true, state: await getContentReactionState(identifier, token) };
            }
            logger.error("reactions", "toggle failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true, state: await getContentReactionState(identifier, token) };
    } catch (err) {
        logger.error("reactions", "exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

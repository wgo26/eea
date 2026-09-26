/**
 * Homepage hero quality score — Tier-2 ranking behind Tier-1 admin slots.
 *
 * Zero-config hero ordering that does not depend on the binary
 * `is_featured` flag alone: engagement (views/shares) log-scaled so a
 * 1,000-view story sits near the cap without dominating forever, a decayed
 * freshness bonus that expires after the ops-sweep unfeature window, a
 * trust bonus for verified/official sources (the project's trust layer),
 * and a small bonus for stories with a cover image — the hero is
 * photography-led, a coverless story looks broken there.
 *
 * The is_featured flag (earned via the ops-sweep ladder, E4) keeps its
 * weight: manual curation (homepage_slots) still outranks everything —
 * this module only ranks the automatic fallback pool.
 */

export type HeroRankedItem = {
    id: string;
    isFeatured?: boolean;
    viewCount?: number;
    shareCount?: number;
    imageUrl?: string | null;
    verification?: string | null;
    publishedAt?: string | null;
};

export const HERO_RANK_WEIGHTS = {
    featured: 100,
    /** Log2-scaled views, capped: 1k views ≈ +59, 4k+ = cap. */
    viewsCap: 60,
    viewsPerDoubling: 6,
    sharesEach: 3,
    sharesCap: 30,
    officialSource: 30,
    verified: 20,
    cover: 10,
    /** Full bonus at publish, 0 after this many days (matches UNFEATURE_DAYS/2). */
    freshness: 40,
    freshnessDays: 7,
} as const;

export function heroScore(item: HeroRankedItem, now: number = Date.now()): number {
    const w = HERO_RANK_WEIGHTS;
    let score = 0;
    if (item.isFeatured) score += w.featured;

    const views = Math.max(0, item.viewCount ?? 0);
    if (views > 0) {
        score += Math.min(w.viewsCap, Math.log2(1 + views) * w.viewsPerDoubling);
    }
    const shares = Math.max(0, item.shareCount ?? 0);
    if (shares > 0) score += Math.min(w.sharesCap, shares * w.sharesEach);

    if (item.verification === "official_source") score += w.officialSource;
    else if (item.verification === "verified") score += w.verified;

    if (item.imageUrl) score += w.cover;

    const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (!Number.isNaN(publishedMs)) {
        const daysOld = Math.max(0, (now - publishedMs) / 86_400_000);
        score += Math.max(0, w.freshness * (1 - daysOld / w.freshnessDays));
    }
    return score;
}

/** Score desc → newest first → id, so equal-quality days never reshuffle randomly. */
export function rankForHero<T extends HeroRankedItem>(items: T[], now: number = Date.now()): T[] {
    return [...items].sort((a, b) => {
        const byScore = heroScore(b, now) - heroScore(a, now);
        if (byScore !== 0) return byScore;
        const byDate = (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
        return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });
}

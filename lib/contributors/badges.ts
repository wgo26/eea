/**
 * W22 — contributor badges (reciprocity loop: contributors see the platform
 * noticing them). Computed purely from the public profile aggregates
 * (published stories, photographs) — no tables, no writes, no PII. Tiers
 * are intentionally few and stable so a badge never disappears once earned.
 */

export type BadgeId = "first-story" | "voice" | "pillar" | "visual-eye";

export type EarnedBadge = { id: BadgeId; at: number };

/** Badge thresholds, lowest first. `at` = stories (or photos for visual-eye). */
const TIERS: { id: BadgeId; at: number; photos?: boolean }[] = [
    { id: "first-story", at: 1 },
    { id: "voice", at: 5 },
    { id: "pillar", at: 20 },
    { id: "visual-eye", at: 10, photos: true },
];

/** Badges earned for the given public aggregates, in tier order. */
export function earnedBadges(publishedCount: number, photoCount: number): EarnedBadge[] {
    const stories = Math.max(0, Math.floor(publishedCount ?? 0));
    const photos = Math.max(0, Math.floor(photoCount ?? 0));
    return TIERS.filter((t) => (t.photos ? photos : stories) >= t.at).map((t) => ({
        id: t.id,
        at: t.at,
    }));
}

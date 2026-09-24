/**
 * Public social-proof thresholds for content detail pages.
 *
 * Product rule: view counts are shown publicly only when above 15, share
 * counts only when above 10. Below the thresholds the counts stay hidden
 * (they still accumulate and remain visible in admin insights). This avoids
 * "0 views / 1 share" cold-start stigma while keeping popular proof visible.
 *
 * Client-safe: pure constants + predicates, no server imports.
 */

export const VIEW_COUNT_PUBLIC_THRESHOLD = 15;
export const SHARE_COUNT_PUBLIC_THRESHOLD = 10;

/** Publicly visible when strictly above the threshold. */
export function showPublicViews(viewCount: number | null | undefined): boolean {
  return (viewCount ?? 0) > VIEW_COUNT_PUBLIC_THRESHOLD;
}

/** Publicly visible when strictly above the threshold. */
export function showPublicShares(shareCount: number | null | undefined): boolean {
  return (shareCount ?? 0) > SHARE_COUNT_PUBLIC_THRESHOLD;
}

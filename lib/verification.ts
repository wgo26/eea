import type { Dictionary } from "@/lib/i18n";

export type VerificationInfo = { label: string; className: string };

/**
 * Maps a content_items.verification value to its trust-layer badge
 * (Differentiator #5 — visible verification instead of uniform certainty).
 */
export function verificationBadgeInfo(
  verification: string | null,
  dict: Dictionary
): VerificationInfo | null {
  switch (verification) {
    case "verified":
      return { label: `✓ ${dict.badges.verified}`, className: "bg-emerald-600/90 text-white" };
    case "official_source":
      return { label: `✓ ${dict.badges.official}`, className: "bg-sky-600/90 text-white" };
    case "community_submission":
      return {
        label: dict.badges.community,
        className: "bg-white/85 text-neutral-900 backdrop-blur",
      };
    case "developing":
      return { label: dict.badges.developing, className: "bg-amber-400/90 text-neutral-900" };
    default:
      return null;
  }
}

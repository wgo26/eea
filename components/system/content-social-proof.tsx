import { Eye, Share2 } from "lucide-react";
import {
  showPublicShares,
  showPublicViews,
} from "@/lib/content/social-proof";

/**
 * Public social proof — view/share counts gated by the product thresholds
 * (views visible when > 15, shares when > 10). Renders nothing when both
 * are below threshold, so cold-start content never wears a "0 views" badge.
 * Server-safe: pure render over the counts the query already provides.
 */
export function ContentSocialProof({
  viewCount,
  shareCount,
  viewsLabel,
  sharesLabel,
  locale,
}: {
  viewCount?: number | null;
  shareCount?: number | null;
  viewsLabel: string;
  sharesLabel: string;
  locale: string;
}) {
  const showViews = showPublicViews(viewCount);
  const showShares = showPublicShares(shareCount);
  if (!showViews && !showShares) return null;

  const nf = locale === "fr" ? "fr-FR" : "en-GB";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      {showViews ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Eye className="h-4 w-4 text-primary" aria-hidden />
          {(viewCount ?? 0).toLocaleString(nf)} {viewsLabel}
        </span>
      ) : null}
      {showShares ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Share2 className="h-4 w-4 text-primary" aria-hidden />
          {(shareCount ?? 0).toLocaleString(nf)} {sharesLabel}
        </span>
      ) : null}
    </span>
  );
}

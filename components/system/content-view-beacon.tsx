"use client";

import { useEffect } from "react";

/**
 * Per-content view beacon — fires one POST per content id per browser
 * session (sessionStorage guard), so refreshes and React strict-mode
 * double-invokes don't inflate `view_count`. Observational: failures are
 * swallowed. Pairs with the aggregate `AnalyticsBeacon` (surface-level)
 * — this one powers the public ">15 views" proof + admin top-viewed.
 */
export function ContentViewBeacon({ contentId }: { contentId: string }) {
  useEffect(() => {
    if (!contentId) return;
    const key = `eea-viewed-${contentId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable — still count the view */
    }
    void fetch(`/api/content/${contentId}/view`, {
      method: "POST",
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* observational */
    });
  }, [contentId]);

  return null;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { getContentReactionState, toggleContentReaction } from "@/lib/public/actions";
import type { ReactionKind, ReactionState } from "@/lib/public/types";

const TOKEN_KEY = "eea-reactor";

function readerToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/**
 * W20 — anonymous content reactions (spec §16 first slice). Tallies come
 * from the public aggregate view; taps are one-per-reader-per-kind via the
 * browser-held token (same model as poll ballots). Optimistic UI with
 * revert on failure; silent empty state when the backend is unreachable.
 */
export function ReactionBar({
  contentItemId,
  likeLabel,
  helpfulLabel,
}: {
  contentItemId: string;
  likeLabel: string;
  helpfulLabel: string;
}) {
  const [state, setState] = useState<ReactionState>({ likes: 0, helpful: 0, mine: [] });
  const [busy, setBusy] = useState<ReactionKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    getContentReactionState(contentItemId, readerToken()).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [contentItemId]);

  const tap = useCallback(
    async (kind: ReactionKind) => {
      if (busy) return;
      setBusy(kind);
      const tapped = state.mine.includes(kind);
      setState((prev) => ({
        likes: prev.likes + (kind === "like" ? (tapped ? -1 : 1) : 0),
        helpful: prev.helpful + (kind === "helpful" ? (tapped ? -1 : 1) : 0),
        mine: tapped ? prev.mine.filter((k) => k !== kind) : [...prev.mine, kind],
      }));
      const res = await toggleContentReaction(contentItemId, kind, readerToken());
      if (res.ok) {
        setState(res.state);
      } else {
        // Revert the optimistic tap; the counts re-sync on next mount.
        setState((prev) => ({
          likes: prev.likes + (kind === "like" ? (tapped ? 1 : -1) : 0),
          helpful: prev.helpful + (kind === "helpful" ? (tapped ? 1 : -1) : 0),
          mine: tapped ? [...prev.mine, kind] : prev.mine.filter((k) => k !== kind),
        }));
      }
      setBusy(null);
    },
    [busy, contentItemId, state.mine],
  );

  const btn = (active: boolean) =>
    `inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={`${likeLabel} / ${helpfulLabel}`}>
      <button
        type="button"
        onClick={() => tap("like")}
        disabled={busy !== null}
        aria-pressed={state.mine.includes("like")}
        className={btn(state.mine.includes("like"))}
      >
        <span aria-hidden>👍</span> {likeLabel}
        <span className="tabular-nums text-muted-foreground">{state.likes}</span>
      </button>
      <button
        type="button"
        onClick={() => tap("helpful")}
        disabled={busy !== null}
        aria-pressed={state.mine.includes("helpful")}
        className={btn(state.mine.includes("helpful"))}
      >
        <span aria-hidden>💡</span> {helpfulLabel}
        <span className="tabular-nums text-muted-foreground">{state.helpful}</span>
      </button>
    </div>
  );
}

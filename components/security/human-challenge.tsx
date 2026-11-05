"use client";

import { useEffect, useRef, useState } from "react";

import { requestHumanChallenge } from "@/lib/security/human-actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { POW_FIELD } from "@/lib/security/human-fields";
import {
  decodePowChallenge,
  solvePowChallenge,
  type PowChallengeParams,
} from "@/lib/security/pow-solve";

/** Client view of the server's mode resolution (human-gate.ts must agree). */
const MODE: "pow" | "turnstile" | "off" =
  process.env.NEXT_PUBLIC_HUMAN_MODE === "turnstile"
    ? "turnstile"
    : process.env.NEXT_PUBLIC_HUMAN_MODE === "off" &&
        process.env.NODE_ENV !== "production"
      ? "off"
      : "pow";

/**
 * Copy seam for the gate, mirroring the dictionary slice at
 * `dict.common.human`. The English defaults are the documented fallback for a
 * caller that does not thread the dictionary (project standard: literal
 * fallbacks must resolve to a real dictionary key, which these do).
 */
export type HumanGateCopy = {
  preparing: string;
  verifying: string;
  verified: string;
  failed: string;
  retry: string;
  /** `{percent}` is replaced with the solve progress, 0–100. */
  progress: string;
};

const DEFAULT_COPY: HumanGateCopy = {
  preparing: 'Preparing the verification challenge...',
  verifying: "Verifying you're human — a brief, battery-friendly check...",
  verified: "Verified — you're good to submit.",
  failed:
    "Automatic verification didn't finish. Check that this device's date and time are correct, then try again.",
  retry: 'Try again',
  progress: '{percent}% complete',
};

/**
 * Human-verification gate.
 *
 * PoW mode (default): requests a signed challenge from the same origin and
 * solves it with local WebCrypto — no third-party script, no iframe, no CDN.
 * A mid-range phone finishes in roughly a second at the default difficulty,
 * and the solved token rides the `pow-response` hidden field.
 *
 * `NEXT_PUBLIC_HUMAN_MODE=turnstile` renders the legacy Cloudflare widget
 * (the rollback lever). `=off` (non-production) renders nothing.
 *
 * Lifecycle mirrors the widget this replaces:
 *  - deferred: the challenge is fetched only when the gate scrolls near the
 *    viewport (submission forms sit below the fold on small screens);
 *  - visible failure states with in-place retry (no page reload needed on
 *    metered connections);
 *  - single-use tokens: parents remount via `key` after a failed submit,
 *    which re-issues and re-solves.
 */
export function HumanChallenge({ copy = DEFAULT_COPY }: { copy?: HumanGateCopy } = {}) {
  if (MODE === "turnstile") return <TurnstileWidget />;
  if (MODE === "off") return <input type="hidden" name={POW_FIELD} value="" />;
  return <PowChallengeGate copy={copy} />;
}

type PowStatus = "idle" | "issuing" | "solving" | "ready" | "failed";

function PowChallengeGate({ copy }: { copy: HumanGateCopy }) {
  const [status, setStatus] = useState<PowStatus>("idle");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (MODE !== "pow") return;
    let cancelled = false;

    const run = async () => {
      setStatus("issuing");
      const challenge = await requestHumanChallenge();
      if (cancelled) return;
      if (!challenge) {
        setStatus("failed");
        return;
      }
      const params: PowChallengeParams | null = decodePowChallenge(challenge.challenge);
      if (!params || !(params.exp > Date.now())) {
        if (!cancelled) setStatus("failed");
        return;
      }
      setStatus("solving");
      setProgress(0);
      const expected = 2 ** params.bits;
      try {
        const nonce = await solvePowChallenge(params, {
          progressEvery: 512,
          onProgress: (attempts) => {
            setProgress(Math.min(95, Math.round((attempts / expected) * 100)));
          },
        });
        if (cancelled) return;
        setToken(`${challenge.challenge}.${nonce}`);
        setProgress(100);
        setStatus("ready");
      } catch {
        // Expired mid-solve or decode failure: a retry issues a fresh
        // challenge. Same posture as a dropped CDN script in the old widget,
        // except the retry is local and instant.
        if (!cancelled) setStatus("failed");
      }
    };

    // Deferred start (mirror of the old widget): start once near the viewport.
    const element = containerRef.current;
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && element) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            observer = null;
            void run();
          }
        },
        { rootMargin: "400px" },
      );
      observer.observe(element);
    } else {
      void run();
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [attempt]);

  const retry = () => {
    setToken("");
    setProgress(0);
    setAttempt((n) => n + 1);
  };

  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
        <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
        {copy.verified}
        <input type="hidden" name={POW_FIELD} value={token} />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
        <p role="alert" className="text-sm text-destructive">
          {copy.failed}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          {copy.retry}
        </button>
        <input type="hidden" name={POW_FIELD} value="" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      >
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-amber-500" />
        {status === "issuing" ? copy.preparing : copy.verifying}
        <span className="sr-only">
          {progress > 0 ? copy.progress.replace("{percent}", String(progress)) : copy.verifying}
        </span>
      </div>
      <div
        aria-hidden
        className="h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <input type="hidden" name={POW_FIELD} value="" />
    </div>
  );
}

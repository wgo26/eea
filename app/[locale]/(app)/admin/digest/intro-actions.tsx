"use client";

import { useState } from "react";
import { aiDigestIntro } from "@/lib/admin/actions/ai";

export type IntroCopy = {
  introTitle: string;
  introRegenerate: string;
  introWorking: string;
  introCopy: string;
  introCopied: string;
  introEmpty: string;
  introSubjectLabel: string;
};

/**
 * P3 — per-issue AI intro preview. Regenerates the lead-in + subject the
 * tonight send will use (same llmDigestIntro the cron resolves), so editors
 * review it during the day instead of discovering it in their inbox.
 * Preview-only: the send path re-resolves at fan-out; nothing is stored.
 */
export function DigestIntroPanel({
  copy,
  locale,
  dateLabel,
  headlines,
}: {
  copy: IntroCopy;
  locale: "en" | "fr";
  dateLabel: string;
  headlines: string[];
}) {
  const [intro, setIntro] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    if (working || headlines.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      const res = await aiDigestIntro({ locale, dateLabel, headlines: headlines.slice(0, 12) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIntro(res.intro.trim().slice(0, 220));
      setSubject(res.subject.trim().slice(0, 70));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {copy.introTitle} · AI
        </p>
        <div className="flex items-center gap-2">
          {intro ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                void navigator.clipboard?.writeText(`${subject ?? ""}\n${intro}`.trim());
              }}
            >
              {copy.introCopy}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void regenerate()}
            disabled={working || headlines.length === 0}
            className="shrink-0 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {working ? copy.introWorking : copy.introRegenerate}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
      ) : intro ? (
        <div className="mt-1.5 space-y-0.5">
          <p className="text-xs italic text-foreground">_{intro}_</p>
          {subject ? (
            <p className="text-xs text-muted-foreground">
              {copy.introSubjectLabel}: {subject}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">{copy.introEmpty}</p>
      )}
    </div>
  );
}

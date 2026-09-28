"use client";

import { useState } from "react";
import { aiFindDuplicates, aiModerationTriage } from "@/lib/admin/actions/ai";

export type TriageCopy = {
  triageTitle: string;
  triageRun: string;
  triageWorking: string;
  triageOff: string;
  triageSuggestion: string;
  triageFlags: string;
  triageScores: string;
  triageRationale: string;
  triagePii: string;
};

export type TriageResult = {
  spam: number;
  scam: number;
  toxicity: number;
  pii: boolean;
  overall: number;
  flags: string[];
  suggestedAction: string;
  rationale: string;
};

/**
 * P4 — opt-in moderation triage. Advisory scores only: the reviewer always
 * decides (approve / clarify / reject live below). Nothing auto-acts, and
 * the panel reports honestly when the ai.moderation_triage flag is off.
 */
export function TriagePanel({ copy, text, hasPhotos }: { copy: TriageCopy; text: string; hasPhotos: boolean }) {
  const [result, setResult] = useState<TriageResult | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dups, setDups] = useState<{ id: string; title: string; path: string; similarity: number }[] | null>(null);

  async function run() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const [tri, dup] = await Promise.all([
        aiModerationTriage({ text, hasPhotos }),
        aiFindDuplicates({ text }).catch(() => ({ ok: false }) as const),
      ]);
      if (!tri.ok) {
        setError(tri.error);
      } else {
        setResult(tri);
      }
      if (dup && dup.ok && "hits" in dup && dup.hits.length > 0) setDups(dup.hits);
      else setDups(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed.");
    } finally {
      setWorking(false);
    }
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const tone = (n: number) =>
    n >= 0.85 ? "text-destructive" : n >= 0.6 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <section className="rounded-lg border border-dashed border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {copy.triageTitle} <span className="text-xs font-normal text-muted-foreground">· AI advisory</span>
        </h2>
        <button
          type="button"
          onClick={() => void run()}
          disabled={working || !text.trim()}
          className="shrink-0 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          {working ? copy.triageWorking : copy.triageRun}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-muted-foreground">{error}</p>
      ) : result ? (
        <div className="mt-2 space-y-1.5 text-xs">
          <p className={tone(result.overall)}>
            {copy.triageSuggestion}: <strong>{result.suggestedAction}</strong> ({pct(result.overall)})
          </p>
          {/* The suggestion advises; the decision controls live below. Link the
              two so "reject" never sits above a generic "Approve & publish" CTA
              without pointing at the matching control. */}
          <p>
            <a href="#review-decision" className="text-link hover:underline">
              {result.suggestedAction === 'approve'
                ? '→ Approve & publish below'
                : result.suggestedAction === 'clarify'
                  ? '→ Request clarification below'
                  : result.suggestedAction === 'reject'
                    ? '→ Reject with reason below'
                    : '→ Decide below (notes · approve · clarify · reject)'}
            </a>
          </p>
          <p className="text-muted-foreground">
            {copy.triageScores}: spam {pct(result.spam)} · scam {pct(result.scam)} · toxicity {pct(result.toxicity)}
            {result.pii ? ` · ${copy.triagePii}` : ""}
          </p>
          {result.flags.length > 0 ? (
            <p className="text-muted-foreground">
              {copy.triageFlags}: {result.flags.join(", ")}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            {copy.triageRationale}: {result.rationale}
          </p>
          {dups && dups.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Possible duplicates ({dups.length})
              </p>
              {dups.map((d) => (
                <p key={d.id} className="mt-0.5 truncate">
                  <a href={d.path} target="_blank" rel="noreferrer" className="text-link hover:underline">
                    {d.title}
                  </a>{" "}
                  <span className="text-muted-foreground">· {Math.round(d.similarity * 100)}%</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{copy.triageOff}</p>
      )}
    </section>
  );
}

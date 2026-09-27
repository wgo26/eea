"use client";

import { useState } from "react";
import { aiWeeklyRetro } from "@/lib/admin/actions/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type RetroCopy = {
  retroTitle: string;
  retroGenerate: string;
  retroWorking: string;
  retroGrew: string;
  retroFlopped: string;
  retroBets: string;
};

/**
 * P5 — weekly retro narrator: what grew, what flopped, 3 bets.
 * Generate-on-tap (reads the aggregates on screen, never PII).
 */
export function RetroPanel({
  copy,
  locale,
  stats,
  topTitles,
}: {
  copy: RetroCopy;
  locale: "en" | "fr";
  stats: Record<string, number | string>;
  topTitles: string[];
}) {
  const [retro, setRetro] = useState<{ grew: string; flopped: string; bets: string[] } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const res = await aiWeeklyRetro(locale, { stats, topTitles });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRetro({ grew: res.grew, flopped: res.flopped, bets: res.bets });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retro failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {copy.retroTitle}
          </CardTitle>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={working}
            className="shrink-0 rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {working ? copy.retroWorking : copy.retroGenerate}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : retro ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{copy.retroGrew}:</strong> {retro.grew}
            </p>
            <p>
              <strong>{copy.retroFlopped}:</strong> {retro.flopped}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.retroBets}</p>
              <ol className="mt-1 space-y-1">
                {retro.bets.map((b) => (
                  <li key={b} className="flex gap-2 text-sm">
                    <span aria-hidden className="text-primary">→</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

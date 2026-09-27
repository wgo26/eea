"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listMediaMissingAlt, updateMediaMetadata } from "@/lib/admin/actions/media";
import { aiImageAlt } from "@/lib/admin/actions/ai";
import { useToast } from "@/components/admin/toast";

export type AltBackfillCopy = {
  altBackfillTitle: string;
  altBackfillRun: string;
  altBackfillWorking: string;
  altBackfillDone: string;
  altBackfillEmpty: string;
};

/**
 * P6 — archive alt-text backfill: newest images missing alt, described by
 * the vision model one by one with per-row offline-tolerant fallback
 * (a row that fails keeps its place for the next run — nothing is skipped
 * silently, nothing is written blind).
 */
export function AltBackfillPanel({ copy }: { copy: AltBackfillCopy }) {
  const { addToast } = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<{ id: string; publicUrl: string; caption: string | null }[] | null>(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    listMediaMissingAlt(20)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  async function run() {
    if (working || !rows?.length) return;
    setWorking(true);
    setDone(0);
    setFailed(0);
    let ok = 0;
    let bad = 0;
    for (const row of rows) {
      try {
        const res = await aiImageAlt({ imageUrl: row.publicUrl, title: row.caption ?? "Archive photo" });
        if (res.ok && "alt" in res && res.alt?.trim()) {
          const saved = await updateMediaMetadata(row.id, { altText: res.alt.trim().slice(0, 200) });
          if (saved.ok) ok += 1;
          else bad += 1;
        } else {
          bad += 1;
        }
      } catch {
        bad += 1;
      }
      setDone(ok + bad);
      setFailed(bad);
    }
    addToast(copy.altBackfillDone.replace("{ok}", String(ok)).replace("{bad}", String(bad)), ok > 0 ? "success" : "error");
    setWorking(false);
    const remaining = await listMediaMissingAlt(20).catch(() => []);
    setRows(remaining);
    router.refresh();
  }

  if (rows === null) return null;
  if (rows.length === 0 && !working) {
    return <p className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">{copy.altBackfillEmpty}</p>;
  }

  return (
    <section aria-label={copy.altBackfillTitle} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {copy.altBackfillTitle} · <strong className="text-foreground">{rows.length}</strong>
        {working ? ` · ${done}/${rows.length}${failed > 0 ? ` (${failed} failed)` : ""}` : ""}
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={working || rows.length === 0}
        className="shrink-0 rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        {working ? copy.altBackfillWorking : copy.altBackfillRun}
      </button>
    </section>
  );
}

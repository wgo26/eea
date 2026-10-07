"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import {
  endBroadcast,
  setBroadcastStream,
  startBroadcast,
} from "@/lib/live/actions";
import type { Broadcast } from "@/lib/live/queries";
import { STREAM_PROVIDERS, type StreamProvider } from "@/lib/live/stream";

export type BroadcastControlsCopy = {
  title: string;
  provider: string;
  url: string;
  urlHint: string;
  save: string;
  goLive: string;
  end: string;
  recording: string;
  recap: string;
  saved: string;
  live: string;
  ended: string;
  confirmEnd: string;
  nativeOff: string;
};

const PROVIDER_LABELS: Record<StreamProvider, string> = {
  youtube: "YouTube Live",
  facebook: "Facebook Live",
  native: "Native ingest (Mux/Livepeer)",
};

/**
 * Staff-only broadcast desk, rendered on the event page for
 * `broadcast.live` holders only (the actions re-check the capability).
 * Embed-first: YouTube/Facebook URLs work with zero infrastructure; native
 * ingest stays visibly off until the admin app enables it.
 */
export function BroadcastControls({
  contentItemId,
  slugOrId,
  broadcast,
  nativeEnabled,
  copy,
}: {
  contentItemId: string;
  slugOrId: string;
  broadcast: Broadcast | null;
  nativeEnabled: boolean;
  copy: BroadcastControlsCopy;
}) {
  const [provider, setProvider] = useState<StreamProvider>(broadcast?.provider ?? "youtube");
  const [url, setUrl] = useState(broadcast?.streamUrl ?? "");
  const [recording, setRecording] = useState(broadcast?.recordingUrl ?? "");
  const [recap, setRecap] = useState(broadcast?.recapId ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const status = broadcast?.status ?? "scheduled";

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    if (busy) return;
    setBusy(true);
    const res = await fn();
    setBusy(false);
    setNotice(res.ok ? done : res.error);
  }

  return (
    <section
      aria-label={copy.title}
      className="grid gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-primary">
        <Radio className="h-4 w-4" aria-hidden />
        {copy.title} · {status}
      </h3>

      <label className="grid gap-1 text-xs font-medium">
        {copy.provider}
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as StreamProvider)}
          disabled={status === "live" || busy}
          className="h-10 rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STREAM_PROVIDERS.map((p) => (
            <option key={p} value={p} disabled={p === "native" && !nativeEnabled}>
              {PROVIDER_LABELS[p]}
              {p === "native" && !nativeEnabled ? ` — ${copy.nativeOff}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs font-medium">
        {copy.url}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          disabled={status === "live" || busy}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="font-normal text-muted-foreground">{copy.urlHint}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || status === "live"}
          onClick={() =>
            void run(
              () => setBroadcastStream({ contentItemId, slugOrId, provider, streamUrl: url }),
              copy.saved,
            )
          }
          className="min-h-[44px] rounded-md border border-border px-4 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {copy.save}
        </button>
        {status !== "live" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => startBroadcast({ contentItemId, slugOrId }), copy.live)}
            className="min-h-[44px] rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {copy.goLive}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(copy.confirmEnd)) return;
              void run(() => endBroadcast({ contentItemId, slugOrId, recordingUrl: recording, recapId: recap }), copy.ended);
            }}
            className="min-h-[44px] rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {copy.end}
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">
          {copy.recording}
          <input
            value={recording}
            onChange={(e) => setRecording(e.target.value)}
            placeholder="https://…"
            disabled={busy}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {copy.recap}
          <input
            value={recap}
            onChange={(e) => setRecap(e.target.value)}
            placeholder="uuid"
            disabled={busy}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

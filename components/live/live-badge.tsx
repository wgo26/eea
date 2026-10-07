import type { BroadcastStatus } from "@/lib/live/queries";

/**
 * LIVE / scheduled state badge for event cards and detail headers.
 * Nothing renders without a broadcast — a plain event stays a plain event.
 */
export function LiveBadge({
  status,
  liveLabel,
  soonLabel,
  endedLabel,
}: {
  status: BroadcastStatus | null | undefined;
  liveLabel: string;
  soonLabel: string;
  endedLabel: string;
}) {
  if (!status || status === "ended") {
    if (status !== "ended") return null;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {endedLabel}
      </span>
    );
  }
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        {liveLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
      {soonLabel}
    </span>
  );
}

import { streamEmbedUrl } from "@/lib/live/stream";
import type { Broadcast } from "@/lib/live/queries";

/**
 * Community live player — embed-first. YouTube and Facebook Live URLs render
 * their canonical player iframes; native ingest renders nothing playable
 * until the admin app enables it (the staff control says so explicitly).
 * A URL that does not map to an embed renders the honest fallback, never an
 * empty frame.
 */
export function LivePlayer({
  broadcast,
  title,
  nativeOffLabel,
}: {
  broadcast: Broadcast;
  title: string;
  nativeOffLabel: string;
}) {
  if (broadcast.provider === "native") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/40 p-8 text-center">
        <p className="text-sm font-semibold">{title}</p>
        <p className="max-w-md text-xs text-muted-foreground">{nativeOffLabel}</p>
      </div>
    );
  }
  const src = broadcast.streamUrl
    ? streamEmbedUrl(broadcast.provider, broadcast.streamUrl)
    : null;
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-2xl border bg-black">
      <iframe
        src={src}
        title={title}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

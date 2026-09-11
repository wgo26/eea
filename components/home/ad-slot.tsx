"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Clock, ExternalLink, Mic, Play } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import type { AdCreative } from "@/lib/queries/ads";
import { formatDuration } from "@/lib/media/attachments";
import { cn } from "@/lib/utils";

type AdSlotProps = {
  ad: AdCreative | null;
  dict: Dictionary;
  advertiseHref: string;
  /** "banner" = main leaderboard; "strip" = slim inline band; "rail" = tall sidebar; "inline-bottom" = bottom-of-section placement. */
  variant: "banner" | "rail" | "strip" | "inline-bottom";
  className?: string;
};

function beacon(campaignId: string, slotKey: string, eventType: "impression" | "click") {
  try {
    // Respect Do Not Track; best-effort — a failed beacon never breaks nav.
    if (typeof navigator !== "undefined" && (navigator as Navigator & { doNotTrack?: string }).doNotTrack === "1") return;
    const payload = JSON.stringify({ campaignId, slotKey, eventType });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/ads/event", blob);
    } else {
      void fetch("/api/ads/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    /* beacon failure is never user-visible */
  }
}

/**
 * Fires one impression beacon when the creative scrolls into view, and
 * exposes a click-beacon callback for the destination links. Rendered only
 * for live campaigns (ad !== null) — placeholders track nothing.
 */
function AdTracker({ ad, children }: { ad: AdCreative; children: (trackClick: () => void) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    seen.current = false;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true;
          beacon(ad.id, ad.slotKey, "impression");
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ad.id, ad.slotKey]);

  return <div ref={ref}>{children(() => beacon(ad.id, ad.slotKey, "click"))}</div>;
}

function DestinationLink({
  ad,
  onClick,
  className,
  children,
}: {
  ad: AdCreative;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!ad.destinationUrl) {
    return <div className={className}>{children}</div>;
  }
  return (
    <Link
      href={ad.destinationUrl}
      target="_blank"
      rel="noopener sponsored"
      onClick={onClick}
      className={className}
    >
      {children}
    </Link>
  );
}

/** Ad placement (spec §11). Falls back to an "advertise with us" placeholder. */
export function AdSlot({ ad, dict, advertiseHref, variant, className }: AdSlotProps) {
  return (
    <div className={cn("w-full", className)}>
      <p className="mb-1 text-right text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
        {dict.home.advertisement}
      </p>
      {ad ? (
        <AdTracker ad={ad}>
          {(trackClick) => <CreativeBody ad={ad} dict={dict} variant={variant} onNavigate={trackClick} />}
        </AdTracker>
      ) : (
        <Link
          href={advertiseHref}
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-colors hover:bg-muted/40",
            variant === "banner" && "h-28 gap-1 md:h-36",
            variant === "strip" && "h-24 gap-1 md:h-28",
            variant === "rail" && "aspect-[3/4] gap-2 p-4",
            variant === "inline-bottom" && "h-24 gap-1 md:h-28"
          )}
        >
          <span className="text-sm font-semibold text-muted-foreground">
            {dict.home.yourAdHere}
          </span>
          <span className="text-xs text-link underline-offset-2 hover:underline">
            {dict.home.advertiseWithUs}
          </span>
        </Link>
      )}
    </div>
  );
}

function CreativeBody({
  ad,
  dict,
  variant,
  onNavigate,
}: {
  ad: AdCreative;
  dict: Dictionary;
  variant: AdSlotProps["variant"];
  onNavigate: () => void;
}) {
  switch (ad.creativeType) {
    case "image":
      return <ImageCreative ad={ad} dict={dict} variant={variant} onNavigate={onNavigate} />;
    case "video":
      return <VideoCreative ad={ad} dict={dict} onNavigate={onNavigate} />;
    case "audio":
      return <AudioCreative ad={ad} dict={dict} onNavigate={onNavigate} />;
    case "html":
      return <HtmlCreative ad={ad} variant={variant} />;
    default:
      return <TextCreative ad={ad} variant={variant} onNavigate={onNavigate} />;
  }
}

/** Responsive image: mobile asset at ≤768px, desktop above (art direction). */
function ImageCreative({
  ad,
  dict,
  variant,
  onNavigate,
}: {
  ad: AdCreative;
  dict: Dictionary;
  variant: AdSlotProps["variant"];
  onNavigate: () => void;
}) {
  const src = ad.desktopUrl ?? ad.mobileUrl ?? ad.imageUrl;
  if (!src) return <TextCreative ad={ad} variant={variant} onNavigate={onNavigate} />;
  return (
    <DestinationLink ad={ad} onClick={onNavigate} className="group relative block overflow-hidden rounded-2xl border">
      <picture>
        {ad.mobileUrl ? <source media="(max-width: 768px)" srcSet={ad.mobileUrl} /> : null}
        <img
          src={src}
          alt={ad.name}
          loading="lazy"
          className={cn(
            "w-full bg-muted object-cover",
            variant === "banner" && "h-28 md:h-36",
            variant === "strip" && "h-24 md:h-28",
            variant === "rail" && "aspect-[3/4]",
            variant === "inline-bottom" && "h-24 md:h-28"
          )}
        />
      </picture>
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
        <span className="truncate text-sm font-bold">{ad.name}</span>
        <ExternalLink className="ml-auto h-4 w-4 shrink-0 opacity-70" aria-hidden />
      </span>
      <span className="sr-only">{dict.home.visitAdvertiser}</span>
    </DestinationLink>
  );
}

/**
 * Video creative: click-to-play with poster (never autoplay — the
 * low-bandwidth promise from the content surface applies to ads too).
 * The destination lives on an explicit CTA so taps on the player don't
 * navigate away mid-watch.
 */
function VideoCreative({ ad, dict, onNavigate }: { ad: AdCreative; dict: Dictionary; onNavigate: () => void }) {
  const src = ad.desktopUrl ?? ad.mobileUrl;
  if (!src) return <TextCreative ad={ad} variant="strip" onNavigate={onNavigate} />;
  const duration = formatDuration(ad.durationSeconds);
  return (
    <div className="overflow-hidden rounded-2xl border bg-black">
      <div className="relative">
        <video controls preload="metadata" playsInline poster={ad.posterUrl ?? undefined} className="max-h-80 w-full">
          {ad.mobileUrl ? <source src={ad.mobileUrl} media="(max-width: 768px)" /> : null}
          <source src={src} />
        </video>
        {duration ? (
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
            <Clock className="h-3 w-3" aria-hidden />
            {duration}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 bg-card p-3 text-card-foreground">
        <Play className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{ad.name}</span>
        {ad.destinationUrl ? (
          <DestinationLink
            ad={ad}
            onClick={onNavigate}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
          >
            {dict.home.visitAdvertiser}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </DestinationLink>
        ) : null}
      </div>
    </div>
  );
}

/** Audio creative: compact player (jingles, sponsored messages, podcasts). */
function AudioCreative({ ad, dict, onNavigate }: { ad: AdCreative; dict: Dictionary; onNavigate: () => void }) {
  const src = ad.desktopUrl;
  if (!src) return <TextCreative ad={ad} variant="strip" onNavigate={onNavigate} />;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{ad.name}</p>
        {ad.destinationUrl ? (
          <DestinationLink
            ad={ad}
            onClick={onNavigate}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-link hover:underline"
          >
            {dict.home.visitAdvertiser}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </DestinationLink>
        ) : null}
      </div>
      {ad.copyText ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ad.copyText}</p> : null}
      <audio controls preload="none" src={src} className="mt-3 w-full" />
    </div>
  );
}

/**
 * Third-party HTML snippet in a scriptless sandbox. Static markup + CSS
 * animate fine; scripts never run (the sanitizer strips them on save too).
 */
function HtmlCreative({ ad, variant }: { ad: AdCreative; variant: AdSlotProps["variant"] }) {
  if (!ad.html) return <TextCreative ad={ad} variant={variant} onNavigate={() => {}} />;
  const height =
    ad.height && ad.height > 0 && ad.height <= 1200
      ? ad.height
      : variant === "rail"
        ? 600
        : variant === "banner"
          ? 140
          : 110;
  return (
    <iframe
      title={ad.name}
      srcDoc={ad.html}
      sandbox=""
      loading="lazy"
      scrolling="no"
      className="w-full overflow-hidden rounded-2xl border bg-white"
      style={{ height }}
    />
  );
}

/** Sponsored text card — also the fallback when a creative fails validation. */
function TextCreative({
  ad,
  variant,
  onNavigate,
}: {
  ad: AdCreative;
  variant: AdSlotProps["variant"];
  onNavigate: () => void;
}) {
  return (
    <DestinationLink
      ad={ad}
      onClick={onNavigate}
      className="group relative block overflow-hidden rounded-2xl border"
    >
      <div
        className={cn(
          "w-full bg-muted bg-cover bg-center",
          variant === "banner" && "h-28 md:h-36",
          variant === "strip" && "h-24 md:h-28",
          variant === "rail" && "aspect-[3/4]",
          variant === "inline-bottom" && "h-24 md:h-28"
        )}
        style={ad.imageUrl ? { backgroundImage: `url(${ad.imageUrl})` } : undefined}
      >
        <div className="flex h-full items-center gap-3 bg-black/45 p-4 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold md:text-base">{ad.name}</p>
            {ad.copyText ? (
              <p className="line-clamp-2 text-xs text-white/85 md:text-sm">{ad.copyText}</p>
            ) : null}
          </div>
          <ExternalLink className="ml-auto h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </div>
      </div>
    </DestinationLink>
  );
}

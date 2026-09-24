"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Mail,
  MessageCircle,
  Send,
  Share2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  beaconContentShare,
  resolveShareVoice,
} from "@/lib/analytics/share-voice";

export type ShareSheetLabels = {
  share: string;
  whatsapp: string;
  copyLink: string;
  copied: string;
  facebook: string;
  x: string;
  email: string;
  moreOptions: string;
};

/**
 * ShareSheet — the single extremely-easy share control for content pages.
 *
 * One row answers 95% of shares: a big WhatsApp button (the distribution
 * loop), a native Share button (mobile sheet), and a copy-link button with
 * confirmation. Everything else (Facebook / X / e-mail) hides behind one
 * "More" toggle so the default view stays calm. Every tap beacons the
 * per-content share counter + voice register (observational, never blocks).
 *
 * Touch targets are ≥ 44px; all targets are real buttons (keyboard-safe).
 */
export function ShareSheet({
  url,
  title,
  shareText,
  voiceType,
  locale,
  contentId,
  labels,
}: {
  url: string;
  title: string;
  shareText?: string | null;
  voiceType?: string | null;
  locale?: string;
  /** Per-content id — when set, taps bump `share_count` + voice aggregate. */
  contentId?: string | null;
  labels: ShareSheetLabels;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const loc = locale === "fr" ? "fr" : "en";

  const shareLine = shareText?.trim() || title;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(shareLine);
  const waHref = `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`;

  const beacon = () =>
    beaconContentShare(
      contentId ?? null,
      resolveShareVoice(shareText, voiceType),
      loc,
    );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function shareNative() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (
          navigator as Navigator & {
            share: (d: { title: string; text: string; url: string }) => Promise<void>;
          }
        ).share({ title, text: shareLine, url });
        beacon();
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    copyLink();
  }

  const open = (target: string) => {
    beacon();
    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary: WhatsApp first — the distribution loop. */}
        <Button
          size="lg"
          onClick={() => open(waHref)}
          aria-label={labels.whatsapp}
          className="min-h-11 gap-2 bg-[#25D366] font-bold text-white hover:bg-[#1fb857]"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          {labels.whatsapp}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={shareNative}
          className="min-h-11 gap-1.5"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {labels.share}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={copyLink}
          aria-live="polite"
          className="min-h-11 gap-1.5"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? labels.copied : labels.copyLink}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-11"
        >
          {labels.moreOptions}
        </Button>
      </div>
      {expanded ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)
            }
            aria-label={labels.facebook}
            className="min-h-11 gap-1.5"
          >
            <Send className="h-4 w-4" aria-hidden />
            Facebook
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              open(
                `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`,
              )
            }
            aria-label={labels.x}
            className="min-h-11"
          >
            𝕏
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              beacon();
              window.location.href = `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
            }}
            aria-label={labels.email}
            className="min-h-11 gap-1.5"
          >
            <Mail className="h-4 w-4" aria-hidden />
          </Button>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:inline-flex">
            <Link2 className="h-3 w-3" aria-hidden />
            {url.replace(/^https?:\/\//, "").slice(0, 48)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

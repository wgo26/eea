"use client";

import { useEffect, useRef, useState } from "react";

import { getAdUnit, isBoxedFormat, readAdNetworkConfig, type AdUnit } from "@/lib/ads/networks";
import { CONSENT_CHANGE_EVENT, readConsent } from "@/lib/consent";
import { cn } from "@/lib/utils";
import { useAdRuntime } from "@/components/ads/ad-runtime-provider";
import { HouseAd, type HouseAdCopy, type HouseAdVariant } from "@/components/ads/house-ad";

/**
 * Remnant ad tag for one slot key.
 *
 * This is the second half of the ad waterfall: `AdSlot` renders a sold,
 * first-party campaign when one exists, and falls back to this component when
 * the slot is empty. Nothing here is network-specific — the tag URL, format,
 * size and `data-*` attributes all come from `NEXT_PUBLIC_AD_SLOTS`
 * (`lib/ads/networks.ts`), so adding PropellerAds/Monetag, AdSense, Adsterra
 * or an affiliate SmartLink is a configuration change.
 *
 * Hard rules, each of which exists because its absence is a known failure:
 *
 *  - **No ad before consent.** The flag is the same `eea-consent` value the
 *    cookie banner writes. `consentRequired` defaults to true; a declined
 *    reader downloads nothing.
 *  - **No consent, no box.** The empty state renders *nothing*, so a cached
 *    page never ships a blank reserved rectangle.
 *  - **No layout shift.** A boxed unit reserves its configured height and only
 *    injects the tag within 300px of the viewport.
 *  - **No inline injection.** `document.createElement("script")` only — no
 *    `innerHTML`, no `eval`; hostile config is dropped by the parser, and the
 *    deployment CSP `script-src` allowlist is the second gate.
 *  - **Labelled.** Every unit carries the localized "Advertisement" label that
 *    features.md requires for paid placement.
 */

/** One injected tag per slot per page session (React strict-mode safe). */
const injected = new Set<string>();
/** AdSense refuses a second `push()` into the same `<ins>` element. */
const pushed = new Set<string>();
/** Page-level tags (push/interstitial/popunder) are limited to one per session. */
let pageLevelInjected = false;

function injectScript(unit: AdUnit, key: string = unit.slotKey) {
  if (injected.has(key)) return;
  injected.add(key);
  const script = document.createElement("script");
  script.src = unit.url;
  script.async = true;
  script.referrerPolicy = "no-referrer-when-downgrade";
  script.dataset.eeaAdSlot = unit.slotKey;
  // Google's loader is normally requested as
  // `adsbygoogle.js?client=ca-pub-…` with `crossorigin` for error attribution.
  if (unit.kind === "adsense" && unit.adsense) {
    const loader = new URL(unit.url);
    loader.searchParams.set("client", unit.adsense.client);
    script.src = loader.toString();
    script.crossOrigin = "anonymous";
  }
  for (const [name, value] of Object.entries(unit.attributes)) {
    script.setAttribute(name, value);
  }
  document.body.appendChild(script);
}

function pushAdsense(unit: AdUnit) {
  if (pushed.has(unit.slotKey)) return;
  pushed.add(unit.slotKey);
  const w = window as Window & { adsbygoogle?: unknown[] };
  // The loader defines this queue; pushing before it arrives is the documented
  // way to enqueue a unit.
  w.adsbygoogle = w.adsbygoogle || [];
  w.adsbygoogle.push({});
}

export type NetworkAdSlotProps = {
  /** Placement key shared with `ad_slots.slot_key` — e.g. `homepage-banner`. */
  slotKey: string;
  /** Layout of the placement; sizes the house card and the reserved box. */
  variant: HouseAdVariant;
  /** Localized copy for the house/fill card. */
  copy: HouseAdCopy;
  className?: string;
};

export function NetworkAdSlot({ slotKey, variant, copy, className }: NetworkAdSlotProps) {
  // Server-resolved config (Postgres, edited at /admin/ads) arrives through
  // context; the env config is the fallback when no provider is mounted (or the
  // database has no network rows yet).
  const runtime = useAdRuntime();
  const config = runtime?.config ?? readAdNetworkConfig();
  const locale = runtime?.locale ?? "en";
  const unit = getAdUnit(slotKey, config);
  const [allowed, setAllowed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Consent is client-only (`localStorage`), so it is resolved after hydration.
  // Until then `allowed` is false: no tag can load from cached HTML.
  useEffect(() => {
    if (!unit) return;
    const dnt = (navigator as Navigator & { doNotTrack?: string }).doNotTrack === "1";
    const update = () =>
      setAllowed(!dnt && (!config.consentRequired || readConsent() === "accepted"));
    update();
    window.addEventListener(CONSENT_CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [unit, config]);

  // Inject lazily. Page-level formats (popunder, push, interstitial, vignette)
  // paint outside the document flow, so they load on mount and reserve nothing.
  useEffect(() => {
    if (!unit || !allowed) return;
    if (unit.kind === "adsense") {
      injectScript(unit, `adsense:${unit.adsense?.client ?? unit.url}`);
      pushAdsense(unit);
      return;
    }
    if (unit.kind === "link") return;
    if (!isBoxedFormat(unit.format) && pageLevelInjected) return;
    const target = boxRef.current;
    if (!isBoxedFormat(unit.format) || !target || typeof IntersectionObserver === "undefined") {
      if (!isBoxedFormat(unit.format)) pageLevelInjected = true;
      injectScript(unit);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        injectScript(unit);
        observer.disconnect();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [unit, allowed]);

  const house = config.houseAds ? <HouseAd locale={locale} copy={copy} variant={variant} /> : null;

  if (!unit) {
    if (!house) return null;
    return (
      <aside className={cn("w-full", className)} aria-label={copy.label}>
        {house}
      </aside>
    );
  }

  const boxed = unit.kind === "adsense" || (unit.kind === "script" && isBoxedFormat(unit.format));
  // Consent gate. A reserved box may stay on screen (the house card fills it),
  // but nothing from the network may paint for a reader who declined.
  if (!allowed && (!boxed || !config.reserveSpace)) {
    if (!house) return null;
    return (
      <aside className={cn("w-full", className)} aria-label={copy.label}>
        {house}
      </aside>
    );
  }

  // Page-level formats (popunder, push, interstitial, vignette) paint outside
  // the flow: they reserve no space and render nothing here.
  if (!boxed && unit.kind !== "link") return null;

  // Plain link unit (affiliate SmartLink, direct-link inventory): no third-party
  // script at all, just a labelled, sponsored link.
  if (unit.kind === "link") {
    return (
      <aside className={cn("w-full", className)} aria-label={copy.label}>
        <a
          href={unit.url}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
          data-ad-network={unit.network}
          data-ad-slot={unit.slotKey}
          className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          <span className="min-w-0 truncate">{copy.label}</span>
          <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
            ↗
          </span>
        </a>
      </aside>
    );
  }

  const height = unit.height ?? undefined;

  return (
    <aside
      className={cn("w-full", className)}
      aria-label={copy.label}
      data-ad-network={unit.network}
      data-ad-slot={unit.slotKey}
    >
      <p className="mb-1 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
        {copy.label}
      </p>
      <div
        ref={boxRef}
        className="w-full overflow-hidden rounded-2xl border bg-muted/30"
        style={height ? { minHeight: height } : undefined}
      >
        {/* Until consent is given (and while a consenting reader's tag is still
            loading) the reserved box shows the house card — never an empty
            rectangle, and never a layout shift. */}
        {!allowed && house ? house : null}
        {allowed && unit.kind === "adsense" && unit.adsense ? (
          <ins
            className="adsbygoogle block w-full"
            style={{ display: "block", minHeight: height }}
            data-ad-client={unit.adsense.client}
            data-ad-slot={unit.adsense.adSlot}
            data-ad-format={unit.adsense.format ?? "auto"}
            data-full-width-responsive={unit.adsense.layout ?? "true"}
          />
        ) : null}
      </div>
    </aside>
  );
}
"use client";

import Link from "next/link";

import type { Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { cn } from "@/lib/utils";

/**
 * House ad — the site's own "Advertise with us" card.
 *
 * It is the answer to two problems at once:
 *
 *  1. **No empty box.** A placement with no sold campaign and no network tag
 *     used to render nothing, which is safe but wastes the impression; a
 *     repeated "your ad here" placeholder reads as unfinished. A house ad is a
 *     real, labelled call to action instead of a placeholder.
 *  2. **No layout shift.** It is a plain server-renderable card, so it occupies
 *     the reserved slot from the first paint. When a network tag is configured
 *     the card sits inside the reserved box until the tag paints, and a reader
 *     who declined cookies keeps the card rather than an empty rectangle.
 *
 * Copy is always passed in (localized by the caller via `dict`), and the href is
 * built with `localePath` — no `/en` or `/fr` literal.
 */

export type HouseAdVariant = "banner" | "rail" | "strip" | "inline-bottom";

export type HouseAdCopy = {
  /** Small caption, e.g. "Advertisement". */
  label: string;
  /** Headline, e.g. "Advertise with us". */
  title: string;
  /** One-line supporting copy. */
  body: string;
};

const HEIGHT_CLASS: Record<HouseAdVariant, string> = {
  banner: "min-h-28 md:min-h-36",
  rail: "min-h-64",
  strip: "min-h-24 md:min-h-28",
  "inline-bottom": "min-h-24 md:min-h-28",
};

export function HouseAd({
  locale,
  copy,
  variant,
  className,
}: {
  locale: Locale;
  copy: HouseAdCopy;
  variant: HouseAdVariant;
  className?: string;
}) {
  return (
    <Link
      href={localePath(locale, "/advertise")}
      className={cn(
        "group flex w-full flex-col justify-center gap-1 rounded-2xl border border-dashed bg-muted/40 p-4 transition-colors hover:bg-accent",
        HEIGHT_CLASS[variant],
        className,
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-primary/80">
        {copy.label}
      </span>
      <span className="text-sm font-bold md:text-base">{copy.title}</span>
      <span className="line-clamp-2 text-xs text-muted-foreground md:text-sm">{copy.body}</span>
    </Link>
  );
}
"use client";

import { useId, useState } from "react";
import type { PhotoPair } from "@/lib/queries/photo-pairs";

/**
 * Phase 4 — Then & Now comparison slider (Differentiator #11). Two stacked
 * images, one clipped by a draggable divider. Pure CSS + range input, so it
 * works keyboard-first (arrow keys move the handle) and ships no JS image
 * library to the low-bandwidth audience.
 */
export function ThenNowSlider({
    pair,
    thenLabel,
    nowLabel,
}: {
    pair: PhotoPair;
    thenLabel: string;
    nowLabel: string;
}) {
    const [position, setPosition] = useState(50);
    const sliderId = useId();
    if (!pair.thenImageUrl && !pair.nowImageUrl) return null;

    return (
        <figure className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="relative aspect-[16/10] w-full select-none overflow-hidden bg-muted">
                {/* Now (base layer) */}
                {pair.nowImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={pair.nowImageUrl}
                        alt={pair.nowCaption ?? nowLabel}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                    />
                ) : null}
                {/* Then (clipped overlay) */}
                {pair.thenImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={pair.thenImageUrl}
                        alt={pair.thenCaption ?? thenLabel}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                        draggable={false}
                    />
                ) : null}
                <span className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-foreground backdrop-blur-sm">
                    {thenLabel}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-foreground backdrop-blur-sm">
                    {nowLabel}
                </span>
                {/* Divider handle */}
                <span
                    aria-hidden
                    className="absolute inset-y-0 w-0.5 bg-background shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                    style={{ left: `${position}%` }}
                >
                    <span className="absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background text-sm font-bold text-foreground shadow-md">
                        ↔
                    </span>
                </span>
                <label htmlFor={sliderId} className="sr-only">
                    {thenLabel} / {nowLabel}
                </label>
                <input
                    id={sliderId}
                    type="range"
                    min={0}
                    max={100}
                    value={position}
                    onChange={(e) => setPosition(Number(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                />
            </div>
            {(pair.thenCaption || pair.nowCaption) && (
                <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-muted-foreground">
                    {pair.thenCaption ? (
                        <span>
                            <strong className="font-semibold text-foreground">{thenLabel}:</strong>{" "}
                            {pair.thenCaption}
                        </span>
                    ) : null}
                    {pair.nowCaption ? (
                        <span>
                            <strong className="font-semibold text-foreground">{nowLabel}:</strong>{" "}
                            {pair.nowCaption}
                        </span>
                    ) : null}
                </figcaption>
            )}
        </figure>
    );
}

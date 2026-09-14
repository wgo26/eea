"use client";

import { useSyncExternalStore } from "react";
import { ALargeSmall, AArrowDown, AArrowUp } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

const STORAGE_KEY = "eea-article-text-size";
const SIZES = ["sm", "md", "lg"] as const;
type TextSize = (typeof SIZES)[number];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readSize(): TextSize {
    let size: TextSize = "md";
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "sm" || stored === "lg") size = stored;
    } catch {
        /* storage unavailable — session default */
    }
    if (typeof document !== "undefined") {
        document.documentElement.dataset.articleSize = size;
    }
    return size;
}

/**
 * A-/A+ article text-size control. Persists to localStorage and mirrors the
 * choice onto `documentElement[data-article-size]`; globals.css scales
 * `.article-body` from that attribute. Server snapshot is "md" (the CSS
 * default), so SSR matches the first paint.
 */
export function TextSizeControl({ copy }: { copy: Dictionary["textSize"] }) {
    const size = useSyncExternalStore(subscribe, readSize, () => "md" as TextSize);
    const index = SIZES.indexOf(size);

    function setSize(next: TextSize) {
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            /* session-only */
        }
        document.documentElement.dataset.articleSize = next;
        for (const listener of listeners) listener();
    }

    const btn =
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";

    return (
        <span className="inline-flex items-center gap-1" role="group" aria-label={copy.reset}>
            <button
                type="button"
                onClick={() => setSize(SIZES[Math.max(0, index - 1)])}
                disabled={index <= 0}
                aria-label={copy.decrease}
                title={copy.decrease}
                className={btn}
            >
                <AArrowDown className="h-4 w-4" aria-hidden />
            </button>
            <button
                type="button"
                onClick={() => {
                    try {
                        localStorage.removeItem(STORAGE_KEY);
                    } catch {
                        /* noop */
                    }
                    document.documentElement.dataset.articleSize = "md";
                    for (const listener of listeners) listener();
                }}
                aria-label={copy.reset}
                title={copy.reset}
                className="inline-flex h-8 items-center rounded-md border border-border px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <ALargeSmall className="h-4 w-4" aria-hidden />
            </button>
            <button
                type="button"
                onClick={() => setSize(SIZES[Math.min(SIZES.length - 1, index + 1)])}
                disabled={index >= SIZES.length - 1}
                aria-label={copy.increase}
                title={copy.increase}
                className={btn}
            >
                <AArrowUp className="h-4 w-4" aria-hidden />
            </button>
        </span>
    );
}

"use client";

import { useSyncExternalStore } from "react";
import { Contrast } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "eea-contrast";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readContrast(): boolean {
    let on = false;
    try {
        on = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        /* session default */
    }
    if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("high-contrast", on);
    }
    return on;
}

/**
 * High-contrast accessibility toggle: flips `html.high-contrast`, under
 * which globals.css boosts text/border contrast and underlines links.
 * Independent from (and combinable with) the light/dark theme.
 */
export function ContrastToggle({ label }: { label: string }) {
    const on = useSyncExternalStore(subscribe, readContrast, () => false);

    function toggle() {
        const next = !on;
        try {
            localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
            /* session-only */
        }
        document.documentElement.classList.toggle("high-contrast", next);
        for (const listener of listeners) listener();
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={on}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                on
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            <Contrast className="h-4 w-4" aria-hidden />
        </button>
    );
}

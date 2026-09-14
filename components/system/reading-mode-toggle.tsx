"use client";

import { useSyncExternalStore } from "react";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

const STORAGE_KEY = "eea-reading-mode";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readMode(): boolean {
    let on = false;
    try {
        on = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        /* session default */
    }
    if (typeof document !== "undefined") {
        document.body.classList.toggle("reading-mode", on);
    }
    return on;
}

/**
 * Distraction-free reading toggle: flips `body.reading-mode`, under which
 * globals.css hides sidebars/rails/cards and centers the article column.
 * Persisted per browser.
 */
export function ReadingModeToggle({ copy }: { copy: Dictionary["readingMode"] }) {
    const on = useSyncExternalStore(subscribe, readMode, () => false);

    function toggle() {
        const next = !on;
        try {
            localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
            /* session-only */
        }
        document.body.classList.toggle("reading-mode", next);
        for (const listener of listeners) listener();
    }

    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={on}
            aria-label={on ? copy.exit : copy.enter}
            title={on ? copy.exit : copy.enter}
            className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                on
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            <BookOpen className="h-4 w-4" aria-hidden />
        </button>
    );
}

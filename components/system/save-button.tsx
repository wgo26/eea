"use client";

import { useEffect, useState } from "react";
import { Bookmark, Heart } from "lucide-react";
import { getSavedStates, toggleSaved } from "@/lib/saves/actions";
import { cn } from "@/lib/utils";

export type SaveButtonLabels = {
    save: string;
    unsave: string;
    savedMessage: string;
    removedMessage: string;
    signIn: string;
};

/**
 * Save-for-later toggle on the `saved_content` table. Bookmarks for
 * editorial stories (#13), hearts for listings (#19) — same storage, the
 * variant only changes the icon. Loads its own state so it can mount in
 * server-rendered cards and detail pages; guests get a sign-in hint.
 */
export function SaveButton({
    contentItemId,
    variant = "bookmark",
    labels,
    className,
}: {
    contentItemId: string;
    variant?: "bookmark" | "heart";
    labels: SaveButtonLabels;
    className?: string;
}) {
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getSavedStates([contentItemId]).then((states) => {
            if (!cancelled) setSaved(Boolean(states[contentItemId]));
        });
        return () => {
            cancelled = true;
        };
    }, [contentItemId]);

    async function flash(message: string) {
        setNotice(message);
        setTimeout(() => setNotice((n) => (n === message ? null : n)), 2500);
    }

    async function handleClick() {
        if (busy) return;
        setBusy(true);
        const result = await toggleSaved(contentItemId);
        setBusy(false);
        if (!result.ok) {
            if (result.error === "Not authenticated.") {
                void flash(labels.signIn);
            }
            return;
        }
        setSaved(result.saved);
        void flash(result.saved ? labels.savedMessage : labels.removedMessage);
    }

    const Icon = variant === "heart" ? Heart : Bookmark;
    const label = saved ? labels.unsave : labels.save;

    return (
        <span className={cn("relative inline-flex", className)}>
            <button
                type="button"
                onClick={handleClick}
                disabled={busy}
                aria-label={label}
                title={label}
                aria-pressed={saved}
                className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:opacity-50",
                    saved
                        ? variant === "heart"
                            ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                            : "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
            >
                <Icon
                    className="h-4 w-4"
                    aria-hidden
                    fill={saved ? "currentColor" : "none"}
                />
            </button>
            {notice ? (
                <span
                    role="status"
                    className="absolute left-1/2 top-full z-10 mt-1 w-max max-w-52 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                >
                    {notice}
                </span>
            ) : null}
        </span>
    );
}

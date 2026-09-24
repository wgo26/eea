"use client";

import { useSyncExternalStore } from "react";
import { Megaphone, X } from "lucide-react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function notify() {
    for (const listener of listeners) listener();
}

function storageKey(id: string) {
    return `eea-announcement:${id}`;
}

function isDismissed(id: string): boolean {
    try {
        return localStorage.getItem(storageKey(id)) === "1";
    } catch {
        return false;
    }
}

/**
 * Site-wide announcement banner (admin: /admin/site-content → Announcement
 * banner). Dismissible per announcement — the dismissal is keyed by content
 * hash in localStorage, so publishing a new announcement shows it again.
 * The server snapshot reports "visible" so the SSR HTML matches the first
 * client render (no hydration mismatch); dismissal applies after hydration.
 *
 * The dismissal id comes from `announcementId` (@/lib/announcement), kept in
 * a server-safe module because the public shell computes it during
 * pre-rendering — importing it from this client module broke the build.
 */
export function AnnouncementBanner({
    id,
    text,
    url,
    dismissLabel,
}: {
    id: string;
    text: string;
    url: string | null;
    dismissLabel: string;
}) {
    const dismissed = useSyncExternalStore(
        subscribe,
        () => isDismissed(id),
        () => false,
    );

    if (dismissed) return null;

    function dismiss() {
        try {
            localStorage.setItem(storageKey(id), "1");
            notify();
        } catch {
            notify();
        }
    }

    const body = (
        <>
            <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate sm:whitespace-normal">{text}</span>
        </>
    );

    return (
        <div className="no-print w-full bg-primary text-primary-foreground">
            <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 text-sm md:px-6">
                {url ? (
                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-2 font-medium underline-offset-4 hover:underline"
                    >
                        {body}
                    </a>
                ) : (
                    <p className="flex min-w-0 flex-1 items-center gap-2 font-medium">{body}</p>
                )}
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label={dismissLabel}
                    className="shrink-0 rounded p-1 opacity-80 transition-opacity hover:opacity-100"
                >
                    <X className="h-4 w-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}

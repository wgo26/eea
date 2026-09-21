"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const INDEX_KEY = "eea-offline-index";

export type SavedArticleRef = { url: string; title: string; savedAt: string };

/** Reads the localStorage index of explicitly saved articles. */
export function readOfflineIndex(): SavedArticleRef[] {
    try {
        const raw = window.localStorage.getItem(INDEX_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as SavedArticleRef[];
        return Array.isArray(parsed) ? parsed.filter((e) => e?.url) : [];
    } catch {
        return [];
    }
}

/**
 * Phase 4 — "Save for offline" (low-bandwidth audience). Caches the article
 * URL in the service worker's articles cache (explicit SAVE message, with a
 * direct caches.open fallback when no worker controls the page yet) and
 * records it in a localStorage index the /offline page lists.
 */
export function SaveOfflineButton({
    url,
    title,
    saveLabel,
    savedLabel,
    unavailableLabel,
}: {
    url: string;
    title: string;
    saveLabel: string;
    savedLabel: string;
    unavailableLabel: string;
}) {
    const [saved, setSaved] = useState(false);
    const [supported, setSupported] = useState(true);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        // Deferred a frame so the server render and the first client render
        // match (Cache API / localStorage are client-only).
        const id = requestAnimationFrame(() => {
            setSupported(typeof window !== "undefined" && "caches" in window);
            setSaved(readOfflineIndex().some((e) => e.url === url));
        });
        return () => cancelAnimationFrame(id);
    }, [url]);

    const save = useCallback(async () => {
        if (busy) return;
        setBusy(true);
        try {
            const absolute = new URL(url, window.location.origin).toString();
            if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: "SAVE", url: absolute });
                // Optimistically cache too — the SAVE round-trip is async.
                try {
                    const cache = await caches.open("eea-v1-articles");
                    await cache.add(absolute);
                } catch {
                    /* worker handles it */
                }
            } else {
                const cache = await caches.open("eea-v1-articles");
                await cache.add(absolute);
            }
            const next = [
                { url, title: title.slice(0, 140), savedAt: new Date().toISOString() },
                ...readOfflineIndex().filter((e) => e.url !== url),
            ].slice(0, 50);
            window.localStorage.setItem(INDEX_KEY, JSON.stringify(next));
            setSaved(true);
        } catch {
            /* cache storage unavailable (private mode) — stay on the button */
        } finally {
            setBusy(false);
        }
    }, [busy, url, title]);

    if (!supported) {
        return (
            <span className="text-xs text-muted-foreground" role="note">
                {unavailableLabel}
            </span>
        );
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={save}
            disabled={busy || saved}
            aria-live="polite"
            className="gap-1.5"
        >
            {saved ? (
                <BookmarkCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            ) : (
                <BookmarkPlus className="h-4 w-4" aria-hidden />
            )}
            {saved ? savedLabel : saveLabel}
        </Button>
    );
}

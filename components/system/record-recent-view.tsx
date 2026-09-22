"use client";

import { useEffect } from "react";

export type RecentView = {
    id: string;
    href: string;
    title: string;
    imageUrl: string | null;
    at: number;
};

const KEY = "eea-recent";
const MAX = 20;

/** Phase 3 — reading history, device-local (no account, no backend). */
export function readRecentViews(): RecentView[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const list = JSON.parse(raw) as RecentView[];
        return Array.isArray(list) ? list.filter((v) => v && v.href && v.title).slice(0, MAX) : [];
    } catch {
        return [];
    }
}

/** Mount on detail pages: records this view at the head of the local list. */
export function RecordRecentView({ view }: { view: Omit<RecentView, "at"> }) {
    useEffect(() => {
        try {
            const next = [
                { ...view, at: Date.now() },
                ...readRecentViews().filter((v) => v.href !== view.href),
            ].slice(0, MAX);
            localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
            /* private mode: history simply doesn't persist */
        }
    }, [view]);
    return null;
}

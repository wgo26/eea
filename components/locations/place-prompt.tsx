"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { localePath } from "@/lib/i18n/urls";
import type { Locale } from "@/lib/i18n/config";
import type { ChromeStrings } from "@/lib/i18n/chrome";
import type { LocationData } from "@/lib/queries/locations";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const PLACE_COOKIE = "eea-place";
const DISMISSED_KEY = "eea-place-dismissed";
const REMIND_KEY = "eea-place-remind-after";
const REMIND_MS = 5 * 24 * 60 * 60 * 1000;

function readPlaceCookie(): { slug: string; name: string } | null {
    try {
        const raw = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${PLACE_COOKIE}=`))
            ?.split("=")[1];
        if (!raw) return null;
        const parsed = JSON.parse(decodeURIComponent(raw)) as { slug?: string; name?: string };
        if (parsed.slug && parsed.name) return { slug: parsed.slug, name: parsed.name };
    } catch {
        /* invalid cookie — treat as unset */
    }
    return null;
}

function writePlaceCookie(place: { slug: string; name: string }): void {
    document.cookie = `${PLACE_COOKIE}=${encodeURIComponent(JSON.stringify(place))}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Phase 4.1 — "Your place" first-visit prompt. Offered exactly once: when no
 * `eea-place` cookie exists and the visitor has not dismissed it before
 * (localStorage flag), a small dialog suggests the top places. Choosing one
 * writes the same cookie `PlaceSelector` reads, so the homepage "Near you"
 * rail lights up on the next refresh. Chrome strings only (every-page
 * header chrome — never the full dictionary).
 */
export function PlacePrompt({
    locale,
    dict,
}: {
    locale: Locale;
    dict: ChromeStrings["locations"];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [places, setPlaces] = useState<LocationData[]>([]);
    const [query, setQuery] = useState("");

    useEffect(() => {
        try {
            if (readPlaceCookie()) return;
            if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
            const snooze = window.localStorage.getItem(REMIND_KEY);
            if (snooze && Number(snooze) > Date.now()) return;
        } catch {
            return;
        }
        // Wait a beat so the prompt never blocks first paint on slow links.
        const timer = window.setTimeout(() => setOpen(true), 1200);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch(localePath(locale, "/api/places"));
                if (!res.ok) return;
                const data = (await res.json()) as { places?: LocationData[] };
                if (!cancelled) setPlaces(data.places ?? []);
            } catch {
                /* keep the dialog usable with an empty list */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [locale, open]);

    function remindLater() {
        // "Not now": re-prompt in 5 days (honest reading of the button's intent)
        // rather than hiding the prompt for the whole session.
        try {
            window.localStorage.setItem(REMIND_KEY, String(Date.now() + REMIND_MS));
        } catch {
            /* private mode — the cookie check still guards re-prompting */
        }
        setOpen(false);
    }

    function dismissForever() {
        try {
            window.localStorage.setItem(DISMISSED_KEY, "1");
            window.localStorage.removeItem(REMIND_KEY);
        } catch {
            /* private mode — the cookie check still guards re-prompting */
        }
        setOpen(false);
    }

    function dismiss() {
        // Backdrop/esc dismiss behaves like "Not now" (5-day snooze) so the
        // prompt does not permanently vanish when a user just closes the sheet.
        remindLater();
    }

    function choose(place: LocationData) {
        writePlaceCookie({ slug: place.slug, name: place.name });
        try {
            window.localStorage.removeItem(REMIND_KEY);
            window.localStorage.setItem(DISMISSED_KEY, "1");
        } catch {
            /* private mode — the cookie check still guards re-prompting */
        }
        router.refresh();
    }

    const q = query.trim().toLowerCase();
    const filtered = (places ?? []).filter(
        (p) =>
            q.length === 0 ||
            p.name.toLowerCase().includes(q) ||
            (p.parentName ?? "").toLowerCase().includes(q),
    );

    return (
        <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
            <DialogContent className="w-[min(380px,calc(100vw-2rem))]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                        {dict.placePromptTitle ?? "Where is home?"}
                    </DialogTitle>
                    <DialogDescription>{dict.placePromptBody ?? ""}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={dict.searchPlaces ?? "Search places…"}
                        aria-label={dict.searchPlaces ?? "Search places"}
                        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="max-h-56 overflow-y-auto rounded-md border border-border/70">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                                {dict.noPlacesFound ?? "No places found."}
                            </p>
                        ) : (
                            filtered.slice(0, 8).map((place) => (
                                <button
                                    key={place.slug}
                                    type="button"
                                    onClick={() => choose(place)}
                                    className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-accent"
                                >
                                    <span className="text-sm font-medium">{place.name}</span>
                                    {place.parentName ? (
                                        <span className="text-xs text-muted-foreground">
                                            {place.parentName}
                                        </span>
                                    ) : null}
                                </button>
                            ))
                        )}
                    </div>
                </div>
                <DialogFooter className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={dismiss}>
                        {dict.placePromptLater ?? "Not now"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={dismissForever}>
                        {dict.placePromptNever ?? "Don't show again"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

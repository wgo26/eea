"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    BookmarkCheck,
    BookmarkPlus,
    ChevronDown,
    Lightbulb,
    MessageCircle,
    X,
} from "lucide-react";

import { readOfflineIndex } from "@/components/system/save-offline-button";
import { whatsappHref } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

export interface MobileReaderPillLabels {
    share: string;
    reactLike: string;
    reactHelpful: string;
    save: string;
    saved: string;
    jumpToCorrections: string;
    reactions: string;
}

export interface MobileReaderPillProps {
    shareUrl: string;
    title: string;
    contentId: string;
    hasCorrections: boolean;
    locale: Locale;
    labels: MobileReaderPillLabels;
}

interface OfflineState {
    saved: boolean;
    supported: boolean;
}

export function MobileReaderPill({
    shareUrl,
    title,
    hasCorrections,
    labels,
}: MobileReaderPillProps) {
    // `locale` stays on the props interface (callers pass it) but this
    // component currently renders locale-neutral chrome.
    const [visible, setVisible] = useState<boolean>(() =>
        typeof document === 'undefined'
            ? true
            : !Boolean(
                  document.querySelector(
                      '[data-slot="sheet-overlay"],[data-slot="dialog-overlay"],[data-slot="drawer-overlay"]',
                  ),
              ),
    );
    const [expanded, setExpanded] = useState(false);
    const [offline, setOffline] = useState<OfflineState>({ saved: false, supported: true });
    const pillRef = useRef<HTMLDivElement>(null);

    const articleBodyId = "article-body";
    const correctionAnchorId = "correction";

    // --- offline save state ---
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            const supported = typeof window !== "undefined" && "caches" in window;
            let saved = false;
            try {
                saved = readOfflineIndex().some((e) => e.url === shareUrl);
            } catch {
                /* private mode */
            }
            setOffline({ saved, supported });
        });
        return () => cancelAnimationFrame(id);
    }, [shareUrl]);

    // --- scroll direction detection ---
    useEffect(() => {
        let lastY = window.scrollY;
        let ticking = false;
        let hiddenBySheet = false;

        function atArticleBottom(): boolean {
            const el = document.getElementById(articleBodyId);
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.bottom <= window.innerHeight + 120;
        }

        function checkOverlay(): boolean {
            const existing = document.querySelector(
                '[data-slot="sheet-overlay"],[data-slot="dialog-overlay"],[data-slot="drawer-overlay"]',
            );
            return Boolean(existing);
        }

        function tick() {
            const y = window.scrollY;
            const delta = y - lastY;

            if (Math.abs(delta) > 6) {
                if (delta > 0 && !atArticleBottom() && y > 80) {
                    setVisible(false);
                } else {
                    setVisible(true);
                }
            }

            // Reveal when scrolled to the bottom of the article body.
            if (atArticleBottom()) {
                setVisible(true);
            }

            lastY = y;

            const overlayNow = checkOverlay();
            if (overlayNow !== hiddenBySheet) {
                hiddenBySheet = overlayNow;
                setVisible(!overlayNow);
            }

            ticking = false;
        }

        function onScroll() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(tick);
            }
        }

        // Initial overlay state came from the lazy useState above; here the
        // local mirror just starts in sync (no synchronous setState).
        hiddenBySheet = checkOverlay();

        window.addEventListener("scroll", onScroll, { passive: true });
        const iv = window.setInterval(() => {
            const overlayNow = checkOverlay();
            if (overlayNow !== hiddenBySheet) {
                hiddenBySheet = overlayNow;
                setVisible(!overlayNow);
            }
        }, 200);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.clearInterval(iv);
        };
    }, []);

    // Close expanded states on scroll.
    useEffect(() => {
        if (!expanded) return;
        const handler = () => {
            setExpanded(false);
        };
        window.addEventListener("scroll", handler, { passive: true });
        return () => window.removeEventListener("scroll", handler);
    }, [expanded]);

    // --- actions ---
    const whatsappShareUrl = whatsappHref(shareUrl, title);

    const jumpToCorrections = useCallback(() => {
        const el = document.getElementById(correctionAnchorId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setExpanded(false);
        }
    }, []);

    const saveOffline = useCallback(async () => {
        if (!offline.supported || offline.saved) return;
        try {
            const absolute = new URL(shareUrl, window.location.origin).toString();
            if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: "SAVE", url: absolute });
            }
            if ("caches" in window) {
                const cache = await caches.open("eea-v1-articles");
                await cache.add(absolute);
            }
            const next = [
                { url: shareUrl, title: title.slice(0, 140), savedAt: new Date().toISOString() },
                ...readOfflineIndex().filter((e) => e.url !== shareUrl),
            ].slice(0, 50);
            window.localStorage.setItem("eea-offline-index", JSON.stringify(next));
            setOffline((prev) => ({ ...prev, saved: true }));
        } catch {
            /* cache storage unavailable (private mode) */
        }
    }, [offline.supported, offline.saved, shareUrl, title]);

    // Hide on print.
    useEffect(() => {
        const mediaQuery = window.matchMedia("print");
        const onChange = (e: MediaQueryListEvent) => setVisible(!e.matches);
        mediaQuery.addEventListener("change", onChange);
        return () => mediaQuery.removeEventListener("change", onChange);
    }, []);

    if (!visible) return null;

    return (
        <div
            ref={pillRef}
        className={cn(
            "fixed bottom-4 left-1/2 z-[40] flex -translate-x-1/2",
            "no-print",
                "transition-all duration-300 ease-out",
                "high-contrast:border high-contrast:border-foreground",
            )}
        >
            {!expanded ? (
                <div
                    className={cn(
                        "flex items-center gap-1 rounded-full border border-border/40",
                        "bg-background/80 px-1.5 py-1.5 shadow-lg backdrop-blur",
                        "high-contrast:bg-background",
                    )}
                >
                    {/* Single chevron — tap to expand the action bar. */}
                    <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        aria-expanded={expanded}
                        aria-label={labels.share}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground high-contrast:hover:bg-accent"
                    >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            ) : (
                <div
                    className={cn(
                        "flex items-center gap-1 rounded-full border border-border/40",
                        "bg-background/90 px-2 py-1.5 shadow-xl backdrop-blur",
                        "high-contrast:bg-background",
                    )}
                >
                    {/* Close (collapse back to chevron). */}
                    <button
                        type="button"
                        onClick={() => {
                            setExpanded(false);
                        }}
                        aria-label="Close"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>

                    {/* WhatsApp share — 1-tap. */}
                    <a
                        href={whatsappShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={labels.share}
                        title={labels.share}
                        onClick={() => {
                            try {
                                navigator?.share?.({
                                    title,
                                    url: shareUrl,
                                });
                            } catch {
                                /* fallback to link navigation */
                            }
                            setExpanded(false);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-green-600 high-contrast:hover:text-foreground"
                    >
                        <MessageCircle className="h-5 w-5" aria-hidden />
                    </a>

                    {/* Lean cut: reactions removed — share + save + corrections only. */}

                    {/* Save offline. */}
                    {offline.supported && (
                        <button
                            type="button"
                            onClick={saveOffline}
                            disabled={offline.saved}
                            aria-label={offline.saved ? labels.saved : labels.save}
                            title={offline.saved ? labels.saved : labels.save}
                            className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground",
                                offline.saved && "text-primary",
                            )}
                        >
                            {offline.saved ? (
                                <BookmarkCheck className="h-5 w-5" aria-hidden />
                            ) : (
                                <BookmarkPlus className="h-5 w-4" aria-hidden />
                            )}
                        </button>
                    )}

                    {/* Jump to corrections. */}
                    {hasCorrections && (
                        <button
                            type="button"
                            onClick={jumpToCorrections}
                            aria-label={labels.jumpToCorrections}
                            title={labels.jumpToCorrections}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            <Lightbulb className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

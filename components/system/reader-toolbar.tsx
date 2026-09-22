"use client";

import { Gauge, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextSizeControl } from "@/components/system/text-size-control";
import { SaveOfflineButton } from "@/components/system/save-offline-button";
import { useLiteMode } from "@/components/media/adaptive-image";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Phase 3 — unified reader toolbar (U6): text size (persisted), lite mode
 * (persisted low-data flag that drops AdaptiveImage quality everywhere),
 * save-offline (Cache API), and WhatsApp share — inline on desktop, plus a
 * sticky WhatsApp action on mobile where forwarding is the distribution loop.
 */
export function ReaderToolbar({
    path,
    shareUrl,
    title,
    shareText,
    saveLabel,
    savedLabel,
    offlineUnavailableLabel,
    whatsappLabel,
    dict,
}: {
    /** Locale-relative page path (for the offline index). */
    path: string;
    /** Absolute canonical URL (for share targets). */
    shareUrl: string;
    title: string;
    /** Pidgin/Camfranglais share line when the editor wrote one. */
    shareText?: string | null;
    saveLabel: string;
    savedLabel: string;
    offlineUnavailableLabel: string;
    whatsappLabel: string;
    dict: Dictionary;
}) {
    const [lite, setLite] = useLiteMode();
    const shareLine = shareText?.trim() || title;
    const waHref = `https://wa.me/?text=${encodeURIComponent(`${shareLine} ${shareUrl}`)}`;

    return (
        <>
            <div
                role="toolbar"
                aria-label={dict.readerToolbar.label}
                className="no-print mt-4 flex flex-wrap items-center gap-2 border-y border-border/70 py-3"
            >
                <TextSizeControl copy={dict.textSize} />
                <Button
                    variant={lite ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLite(!lite)}
                    aria-pressed={lite}
                    title={dict.liteMode.hint}
                    className="gap-1.5"
                >
                    <Gauge className="h-4 w-4" aria-hidden />
                    {lite ? dict.liteMode.enabled : dict.liteMode.enable}
                </Button>
                <SaveOfflineButton
                    url={path}
                    title={title}
                    saveLabel={saveLabel}
                    savedLabel={savedLabel}
                    unavailableLabel={offlineUnavailableLabel}
                />
                <Button
                    variant="outline"
                    size="sm"
                    render={<a href={waHref} target="_blank" rel="noopener noreferrer" />}
                    aria-label={whatsappLabel}
                    className="gap-1.5"
                >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">WhatsApp</span>
                </Button>
            </div>
            {/* Sticky WhatsApp share on mobile (safe-area aware). */}
            <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={whatsappLabel}
                className={cn(
                    "no-print fixed bottom-5 right-4 z-40 inline-flex h-12 w-12 items-center justify-center",
                    "rounded-full bg-[#25D366] text-white shadow-lift transition-transform",
                    "hover:scale-105 active:scale-95 lg:hidden",
                )}
                style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            >
                <MessageCircle className="h-6 w-6" aria-hidden />
            </a>
        </>
    );
}

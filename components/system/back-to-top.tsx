"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SHOW_AFTER_PX = 600;

/**
 * Floating scroll-to-top button. Appears once the reader scrolls past one
 * screenful, hides at the top, and smooth-scrolls back on activation.
 * Mounted once in the [locale] layout so every route gets it.
 */
export function BackToTop({ label }: { label: string }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label={label}
            title={label}
            tabIndex={visible ? 0 : -1}
            className={cn(
                "fixed right-6 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 shadow-lg backdrop-blur transition-all hover:bg-accent hover:text-accent-foreground no-print",
                visible
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-4 opacity-0",
            )}
        >
            <ArrowUp className="h-5 w-5" aria-hidden />
        </button>
    );
}

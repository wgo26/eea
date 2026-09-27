"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SHOW_AFTER_PX = 600;

/**
 * Floating scroll-to-top button. Appears once the reader scrolls past one
 * screenful, hides at the top, and smooth-scrolls back on activation.
 * Mounted once in the [locale] layout so every route gets it.
 *
 * Skipped on /admin routes — the admin shell provides its own floating quick
 * actions FAB in the same bottom-right corner, so rendering BackToTop there too
 * would overlap and compete for the same screen real estate.
 */
export function BackToTop({ label }: { label: string }) {
    const pathname = usePathname() ?? "";
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    if (pathname.startsWith("/admin")) return null;

    return (
        <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label={label}
            title={label}
            tabIndex={visible ? 0 : -1}
            className={cn(
                "fixed right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 shadow-lg backdrop-blur transition-all hover:bg-accent hover:text-accent-foreground no-print",
                visible
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-4 opacity-0",
            )}
        >
            <ArrowUp className="h-5 w-5" aria-hidden />
        </button>
    );
}

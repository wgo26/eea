"use client";

import { useEffect, useState } from "react";

/**
 * Scroll-linked reading progress bar for the article page. Client-only and
 * purely presentational: measures the article element's position against the
 * viewport and renders a gold progress fill. No layout shift (fixed height
 * bar pinned to the top of the viewport).
 */
export function ReadingProgress({ targetId = "article-body" }: { targetId?: string }) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const el = document.getElementById(targetId);
        if (!el) return;
        let raf = 0;
        const update = () => {
            raf = 0;
            const rect = el.getBoundingClientRect();
            const total = rect.height - window.innerHeight * 0.6;
            const read = Math.min(Math.max(-rect.top + window.innerHeight * 0.3, 0), Math.max(total, 1));
            setProgress(total <= 0 ? 1 : Math.min(1, read / Math.max(total, 1)));
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(update);
        };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [targetId]);

    return (
        <div
            className="no-print fixed inset-x-0 top-0 z-50 h-1 bg-transparent"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-hidden={progress === 0}
        >
            <div
                className="h-full bg-primary transition-[width] duration-100 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
            />
        </div>
    );
}

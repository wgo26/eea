"use client";

import { useEffect } from "react";

/**
 * Phase 4 — offline PWA registration. Registers /sw.js once per session on
 * window load (never blocks first paint). Update-safe: when a new worker
 * takes over it serves fresh navigations while the articles cache persists
 * across versions by design (trimmed, not dropped, in the worker).
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;
        // Skip in dev (HMR + worker caches fight each other).
        if (process.env.NODE_ENV !== "production") return;
        const register = () => {
            navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
                /* offline-first is progressive enhancement — never throw */
            });
        };
        if (document.readyState === "complete") register();
        else {
            window.addEventListener("load", register, { once: true });
            return () => window.removeEventListener("load", register);
        }
    }, []);
    return null;
}

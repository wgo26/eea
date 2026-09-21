"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { SmartImage } from "@/components/media/smart-image";

type NetworkInfo = {
    saveData?: boolean;
    effectiveType?: string;
};

const LITE_KEY = "eea-lite";
const liteListeners = new Set<() => void>();

/** Explicit user choice (the ReaderToolbar lite toggle). Device-persisted. */
export function readLiteMode(): boolean {
    try {
        return localStorage.getItem(LITE_KEY) === "1";
    } catch {
        return false;
    }
}

export function setLiteMode(on: boolean): void {
    try {
        if (on) localStorage.setItem(LITE_KEY, "1");
        else localStorage.removeItem(LITE_KEY);
    } catch {
        /* session-only */
    }
    if (typeof document !== "undefined") {
        if (on) document.documentElement.dataset.lite = "1";
        else delete document.documentElement.dataset.lite;
    }
    window.dispatchEvent(new CustomEvent("eea-lite-change"));
    for (const listener of liteListeners) listener();
}

function subscribeLite(listener: () => void): () => void {
    liteListeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === LITE_KEY) listener();
    };
    const onCustom = () => listener();
    window.addEventListener("storage", onStorage);
    window.addEventListener("eea-lite-change", onCustom);
    return () => {
        liteListeners.delete(listener);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("eea-lite-change", onCustom);
    };
}

/**
 * Phase 4 — Save-Data aware image (low-bandwidth audience). Reads
 * `navigator.connection.saveData` / `effectiveType` on mount and drops the
 * optimizer quality for readers on metered or 2G/slow-2G links. Renders the
 * full-quality SmartImage otherwise — same layout contract either way, so no
 * CLS either path. Server renders the default (no connection API on the
 * server, keeping pages static).
 */
function readMetered(): boolean {
    if (readLiteMode()) return true;
    const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    return (
        conn?.saveData === true ||
        conn?.effectiveType === "slow-2g" ||
        conn?.effectiveType === "2g"
    );
}

export function useSaveData(): boolean {
    const [saveData, setSaveData] = useState(false);
    useEffect(() => {
        // Deferred a frame so the server render and the first client render
        // match (no hydration mismatch), then upgrade to lite quality.
        const id = requestAnimationFrame(() => setSaveData(readMetered()));
        const onChange = () => setSaveData(readMetered());
        window.addEventListener("storage", onChange);
        window.addEventListener("eea-lite-change", onChange);
        return () => {
            cancelAnimationFrame(id);
            window.removeEventListener("storage", onChange);
            window.removeEventListener("eea-lite-change", onChange);
        };
    }, []);
    return saveData;
}

/** ReaderToolbar lite toggle: explicit low-data mode, persisted per device. */
export function useLiteMode(): [boolean, (on: boolean) => void] {
    const lite = useSyncExternalStore(subscribeLite, readLiteMode, () => false);
    return [lite, setLiteMode];
}

export function AdaptiveImage({
    src,
    alt,
    className,
    sizes,
    priority = false,
    lowQuality = 35,
}: {
    src: string;
    alt: string;
    className?: string;
    sizes?: string;
    priority?: boolean;
    lowQuality?: number;
}) {
    const lite = useSaveData();
    return (
        <SmartImage
            src={src}
            alt={alt}
            className={className}
            sizes={sizes}
            priority={priority}
            quality={lite ? lowQuality : undefined}
        />
    );
}

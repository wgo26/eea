"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
    applySnapshot,
    snapshot,
    type DraftData,
} from "./use-submit-draft";

export type QueuedSubmission = {
    type: string;
    snapshot: DraftData;
    queuedAt: number;
};

const QUEUE_KEY = "eea-submit-queue";
const MAX_ENTRIES = 5;

/** Read the outbox (exported for unit tests + future queue badges). */
export function readQueue(): QueuedSubmission[] {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (e): e is QueuedSubmission =>
                !!e && typeof e === "object" &&
                typeof (e as QueuedSubmission).type === "string" &&
                typeof (e as QueuedSubmission).queuedAt === "number" &&
                !!(e as QueuedSubmission).snapshot &&
                typeof (e as QueuedSubmission).snapshot === "object",
        );
    } catch {
        return [];
    }
}

function writeQueue(entries: QueuedSubmission[]): void {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
        /* storage full/private — the live form still works */
    }
}

/** True when no reporter-typed value is present (hidden/type/honeypot ignored). */
function isFormEmpty(form: HTMLFormElement): boolean {
    for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
            continue;
        }
        const name = el.name;
        if (!name || name === "submissionType" || name === "website") continue;
        if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file" || el.type === "submit" || el.type === "button" || el.type === "checkbox")) {
            continue;
        }
        if (el.value && el.value.trim()) return false;
    }
    return true;
}

/**
 * Offline outbox for the guest submission loop. Spam protection (Turnstile
 * + rate limits) cannot run offline, so nothing is *sent* while offline —
 * instead the Send tap snapshots text fields into a per-type outbox slot and
 * the form shows a queued receipt. On reconnect the reporter taps once to
 * complete the send (snapshot restored + normal submit, token fresh).
 *
 * Honest limits, stated in the UI copy (dict.submit.queuedNote): file-picker
 * uploads cannot serialize into localStorage — URL-based media survives,
 * picked files must be re-attached. One slot per type; a newer queue
 * replaces an older one.
 */
export function useSubmitQueue(
    type: string,
    formRef: RefObject<HTMLFormElement | null>,
): {
    queued: QueuedSubmission | null;
    online: boolean;
    queueCurrent: () => boolean;
    sendQueued: () => boolean;
    discardQueued: () => void;
} {
    const [queued, setQueued] = useState<QueuedSubmission | null>(null);
    const [online, setOnline] = useState<boolean>(() =>
        typeof navigator === "undefined" ? true : navigator.onLine,
    );

    // Deferred a frame (same pattern as use-submit-draft): reading
    // localStorage synchronously in the effect body trips the
    // set-state-in-effect gate and can mismatch SSR/first paint.
    useEffect(() => {
        const id = requestAnimationFrame(() => {
            setQueued(readQueue().find((e) => e.type === type) ?? null);
        });
        return () => cancelAnimationFrame(id);
    }, [type]);

    useEffect(() => {
        const on = () => {
            setOnline(true);
            setQueued(readQueue().find((e) => e.type === type) ?? null);
        };
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, [type]);

    /** Snapshot the live form into the outbox. Returns false when offline-send is impossible (no form). */
    const queueCurrent = useCallback((): boolean => {
        const form = formRef.current;
        if (!form) return false;
        const snap = snapshot(form);
        if (Object.keys(snap).length === 0) return false;
        const entry: QueuedSubmission = { type, snapshot: snap, queuedAt: Date.now() };
        writeQueue([entry, ...readQueue().filter((e) => e.type !== type)]);
        setQueued(entry);
        return true;
    }, [type, formRef]);

    /** Restore the queued snapshot into the live form and submit it. Caller must be online.
     * Fields the reporter already fixed after a failed send are never
     * overwritten: the snapshot only fills currently-empty fields. */
    const sendQueued = useCallback((): boolean => {
        const form = formRef.current;
        const entry = readQueue().find((e) => e.type === type);
        if (!form || !entry) return false;
        if (isFormEmpty(form)) {
            applySnapshot(form, entry.snapshot);
            // Dispatch input so the draft-autosave listener sees the restore.
            form.dispatchEvent(new Event("input", { bubbles: true }));
        }
        form.requestSubmit();
        return true;
    }, [type, formRef]);

    const discardQueued = useCallback(() => {
        writeQueue(readQueue().filter((e) => e.type !== type));
        setQueued(null);
    }, [type]);

    return { queued, online, queueCurrent, sendQueued, discardQueued };
}

/** Remove this type's outbox slot (called after a successful send). */
export function clearQueued(type: string): void {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return;
        localStorage.setItem(
            QUEUE_KEY,
            JSON.stringify(parsed.filter((e) => !e || (e as QueuedSubmission).type !== type)),
        );
    } catch {
        /* ignore */
    }
}

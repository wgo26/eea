"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export function draftKeyFor(type: string): string {
    return `eea-submit-draft-${type}`;
}

type DraftData = Record<string, string | boolean>;

/** Serializes named text-ish fields (files + the type marker skipped). */
function snapshot(form: HTMLFormElement): DraftData {
    const out: DraftData = {};
    for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
            continue;
        }
        const name = el.name;
        if (!name || name === "submissionType") continue;
        if (el instanceof HTMLInputElement && (el.type === "file" || el.type === "submit" || el.type === "button")) {
            continue;
        }
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
            out[name] = el.checked;
        } else if (el.value) {
            out[name] = el.value;
        }
    }
    return out;
}

function applySnapshot(form: HTMLFormElement, data: DraftData): number {
    let applied = 0;
    for (const [name, value] of Object.entries(data)) {
        const el = form.elements.namedItem(name);
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
            continue;
        }
        if (el instanceof HTMLInputElement && (el.type === "file" || el.type === "submit" || el.type === "button")) {
            continue;
        }
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
            if (el.checked !== Boolean(value)) {
                el.checked = Boolean(value);
                applied += 1;
            }
        } else if (typeof value === "string" && value && el.value !== value) {
            el.value = value;
            applied += 1;
        }
    }
    return applied;
}

/**
 * Phase 3 — draft autosave for the guest submission loop (flaky
 * connections). Every keystroke is debounced into localStorage under a
 * per-type key; a returning visitor gets their unsent fields restored with
 * a notice (never silently), and a successful submit clears the draft.
 * Restore/saves run outside React state (imperative DOM) so SSR and the
 * first paint always match — no hydration mismatch.
 */
export function useSubmitDraft(
    type: string,
    formRef: RefObject<HTMLFormElement | null>,
): { restored: boolean; clearDraft: () => void } {
    const [restored, setRestored] = useState(false);
    const timer = useRef<number | null>(null);

    useEffect(() => {
        const id = requestAnimationFrame(() => {
            const form = formRef.current;
            if (!form) return;
            let raw: string | null = null;
            try {
                raw = localStorage.getItem(draftKeyFor(type));
            } catch {
                return;
            }
            if (!raw) return;
            try {
                const data = JSON.parse(raw) as DraftData;
                if (data && typeof data === "object" && applySnapshot(form, data) > 0) {
                    setRestored(true);
                }
            } catch {
                /* corrupt draft — next save overwrites it */
            }
        });
        return () => cancelAnimationFrame(id);
    }, [type, formRef]);

    useEffect(() => {
        const form = formRef.current;
        if (!form) return;
        const schedule = () => {
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => {
                try {
                    localStorage.setItem(draftKeyFor(type), JSON.stringify(snapshot(form)));
                } catch {
                    /* storage full/private — the form still submits */
                }
            }, 600);
        };
        form.addEventListener("input", schedule);
        form.addEventListener("change", schedule);
        return () => {
            form.removeEventListener("input", schedule);
            form.removeEventListener("change", schedule);
            if (timer.current) window.clearTimeout(timer.current);
        };
    }, [type, formRef]);

    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(draftKeyFor(type));
        } catch {
            /* ignore */
        }
        setRestored(false);
    }, [type]);

    return { restored, clearDraft };
}

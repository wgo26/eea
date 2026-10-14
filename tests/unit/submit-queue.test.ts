import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearQueued, readQueue } from "@/components/submit/use-submit-queue";
import { applySnapshot, snapshot } from "@/components/submit/use-submit-draft";

/**
 * Offline outbox storage layer. The hook's React/DOM half (online
 * listeners, requestSubmit) is e2e territory; what matters here is that the
 * queue round-trips, replaces per type, survives corrupt data, and that the
 * snapshot helpers the queue reuses stay honest. localStorage is stubbed —
 * vitest runs in node.
 */
function stubStorage(initial: Record<string, string> = {}) {
    const store: Record<string, string> = { ...initial };
    vi.stubGlobal("localStorage", {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
            store[k] = v;
        },
        removeItem: (k: string) => {
            delete store[k];
        },
    });
    return {
        raw: () => ({ ...store }),
    };
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

describe("outbox queue", () => {
    it("starts empty and tolerates corrupt data", () => {
        const s = stubStorage({ "eea-submit-queue": "not-json{{{" });
        expect(readQueue()).toEqual([]);
        expect(s.raw()["eea-submit-queue"]).toBe("not-json{{{");
    });

    it("clearQueued removes only its own type", () => {
        stubStorage({
            "eea-submit-queue": JSON.stringify([
                { type: "notice", snapshot: { item: "goat" }, queuedAt: 1 },
                { type: "news", snapshot: { headline: "fire" }, queuedAt: 2 },
            ]),
        });
        clearQueued("notice");
        expect(readQueue()).toEqual([
            { type: "news", snapshot: { headline: "fire" }, queuedAt: 2 },
        ]);
    });

    it("ignores malformed entries", () => {
        stubStorage({
            "eea-submit-queue": JSON.stringify([
                { type: "notice", snapshot: { item: "goat" }, queuedAt: 1 },
                { nope: true },
                "a string",
                null,
                { type: 42, snapshot: {}, queuedAt: 1 },
            ]),
        });
        expect(readQueue()).toEqual([
            { type: "notice", snapshot: { item: "goat" }, queuedAt: 1 },
        ]);
    });
});

describe("snapshot helpers shared with the queue", () => {
    beforeEach(() => {
        // instanceof checks need the constructors to exist in node.
        vi.stubGlobal("HTMLInputElement", class {});
        vi.stubGlobal("HTMLTextAreaElement", class {});
        vi.stubGlobal("HTMLSelectElement", class {});
    });
    it("snapshot skips the type marker and empty values without DOM", () => {
        // Plain objects fail the instanceof checks — returns {} without DOM.
        const form = {
            elements: [
                { name: "submissionType", value: "notice" },
                { name: "item", value: "goat" },
            ],
        } as unknown as HTMLFormElement;
        expect(snapshot(form)).toEqual({});
    });

    it("applySnapshot ignores unknown elements without throwing", () => {
        const form = { elements: { namedItem: () => null } } as unknown as HTMLFormElement;
        expect(applySnapshot(form, { item: "goat" })).toBe(0);
    });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * R13 (Next-upgrade rehearsal pin) — lib/queries/locations.ts leans on the
 * `unstable_cache` API whose semantics a Next 17 upgrade could change. This
 * test pins the contract the rehearsal must re-verify: every cached reader
 * carries the locations tag (so `revalidateTaxonomy` invalidates it) and the
 * shared ISR window, with unique key parts (no cross-reader cache sharing).
 */
const seen = vi.hoisted(() => ({ calls: [] as { keys: string[]; options: unknown }[] }));

vi.mock("next/cache", () => ({
    unstable_cache: (fn: unknown, keys: string[], options: unknown) => {
        seen.calls.push({ keys, options });
        return fn;
    },
}));

import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import { getAllLocations, getLocationBySlug } from "./locations";

describe("locations cache contract (R13 rehearsal pin)", () => {
    it("tags every cached reader for locations invalidation", () => {
        expect(seen.calls.length).toBeGreaterThan(0);
        for (const { keys, options } of seen.calls) {
            expect(keys.length).toBeGreaterThan(0);
            expect(options).toMatchObject({
                tags: [CACHE_TAGS.locations],
                revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
            });
        }
    });

    it("uses unique key parts per cached reader", () => {
        const joined = seen.calls.map((s) => s.keys.join("\n"));
        expect(new Set(joined).size).toBe(joined.length);
    });

    it("still resolves outage fallbacks with no database", async () => {
        await expect(getAllLocations()).resolves.toEqual([]);
        await expect(getLocationBySlug("yaounde")).resolves.toBeNull();
    });
});

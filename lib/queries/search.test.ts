import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => mocks,
}));

import { getSearchResults, searchContentIds } from "./search";

/**
 * Minimal thenable PostgREST query builder: every chained method returns the
 * same object, and awaiting it resolves to the given result — enough surface
 * for search.ts's `.from("content_items").select(…).eq(…).in(…).limit(…)` chain.
 */
function chain(result: { data: unknown; count?: number | null; error: null }) {
    const q = {} as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
    for (const method of ["select", "eq", "not", "in", "order", "limit"]) {
        q[method] = vi.fn(() => q);
    }
    q.then = ((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)) as typeof q.then;
    return q;
}

const ENV = { ...process.env };

describe("A5 — search.ts runs on the search_content RPC", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
        mocks.rpc.mockReset();
        mocks.from.mockReset();
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL;
        process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
    });

    it("searchContentIds returns null for a blank term (no constraint, RPC untouched)", async () => {
        expect(await searchContentIds("   ", "en")).toBeNull();
        expect(await searchContentIds(undefined, "en")).toBeNull();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("searchContentIds calls the RPC with locale + type filter and preserves rank order", async () => {
        mocks.rpc.mockResolvedValue({
            data: [
                { item_id: "b", rank: 0.4, headline_title: "", headline_excerpt: "" },
                { item_id: "a", rank: 0.9, headline_title: "", headline_excerpt: "" },
            ],
            error: null,
        });
        const ids = await searchContentIds("école", "fr", ["news"], 50);
        expect(mocks.rpc).toHaveBeenCalledWith("search_content", {
            p_q: "école",
            p_locale: "fr",
            p_types: ["news"],
            p_limit: 50,
        });
        expect(ids).toEqual(["b", "a"]);
    });

    it("searchContentIds maps an RPC error to an empty list (definitely nothing)", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
        expect(await searchContentIds("bamenda", "en")).toEqual([]);
    });

    it("getSearchResults orders by FTS rank and groups by type", async () => {
        mocks.rpc.mockResolvedValue({
            data: [
                { item_id: "n1", rank: 0.2, headline_title: "<mark>t</mark>", headline_excerpt: "e" },
                { item_id: "n2", rank: 0.8, headline_title: "<mark>t</mark>", headline_excerpt: "e" },
                { item_id: "l1", rank: 0.5, headline_title: "<mark>t</mark>", headline_excerpt: "e" },
            ],
            error: null,
        });
        const rows = [
            { id: "n1", type: "news", slug: "s1", published_at: "2026-01-01", location: null, translations: [{ locale: "en", title: "A", excerpt: null }], media: [] },
            { id: "n2", type: "news", slug: "s2", published_at: "2026-01-02", location: null, translations: [{ locale: "en", title: "B", excerpt: null }], media: [] },
            { id: "l1", type: "listing", slug: null, published_at: "2026-01-03", location: null, translations: [{ locale: "en", title: "C", excerpt: null }], media: [] },
        ];
        mocks.from.mockReturnValue(chain({ data: rows, count: 3, error: null }));

        const results = await getSearchResults({ q: "bamenda 2026 infrastructure", locale: "en" });
        expect(mocks.rpc).toHaveBeenCalledWith("search_content", {
            p_q: "bamenda 2026 infrastructure",
            p_locale: "en",
            p_types: null,
            p_limit: 60,
        });
        expect(results.news.map((n) => n.id)).toEqual(["n2", "n1"]);
        expect(results.news[0].headlineTitle).toBe("<mark>t</mark>");
        expect(results.listings.map((l) => l.id)).toEqual(["l1"]);
        expect(results.total).toBe(3);
    });

    it("getSearchResults falls back to an empty result when the RPC fails", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: "fts down" } });
        const results = await getSearchResults({ q: "anything", locale: "en" });
        expect(results.total).toBe(0);
        expect(mocks.from).not.toHaveBeenCalled();
    });
});

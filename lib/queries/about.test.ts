import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => mocks,
}));

vi.mock("@/lib/observability/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { mapRecordStats, getCommunityStats } from "./about";

const ENV = { ...process.env };

describe("about.ts honest stats run on one RPC", () => {
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

    it("mapRecordStats maps the RPC payload, never fusing currencies", () => {
        const stats = mapRecordStats({
            stories_published: 41,
            contributors: 12,
            places_covered: 5,
            corrections_30d: 3,
            raised_by_currency: { XAF: 1250000, EUR: 3200.5 },
        });
        expect(stats.storiesPublished).toBe(41);
        expect(stats.contributors).toBe(12);
        expect(stats.locationsCovered).toBe(5);
        expect(stats.correctionsPublished30d).toBe(3);
        // No fused total: every currency keeps its own bucket.
        expect(stats.raisedByCurrency).toEqual([
            { currency: "XAF", total: 1250000 },
            { currency: "EUR", total: 3200.5 },
        ]);
        // Headline is the largest bucket, named with its own currency.
        expect(stats.raisedHeadlineCurrency).toBe("XAF");
        expect(stats.raisedHeadlineTotal).toBe(1250000);
    });

    it("mapRecordStats degrades garbage/empty payloads to safe zeros", () => {
        expect(mapRecordStats(null)).toEqual({
            storiesPublished: 0,
            contributors: 0,
            locationsCovered: 0,
            correctionsPublished30d: 0,
            raisedByCurrency: [],
            raisedHeadlineCurrency: null,
            raisedHeadlineTotal: 0,
        });
        const stats = mapRecordStats({
            stories_published: -4,
            contributors: "nope",
            raised_by_currency: { XAF: "junk", "  ": 10, EUR: 0 },
        });
        expect(stats.storiesPublished).toBe(0);
        expect(stats.contributors).toBe(0);
        expect(stats.raisedByCurrency).toEqual([]);
        expect(stats.raisedHeadlineCurrency).toBeNull();
    });

    it("getCommunityStats calls the RPC once and maps the result", async () => {
        mocks.rpc.mockResolvedValue({
            data: {
                stories_published: 7,
                contributors: 2,
                places_covered: 2,
                corrections_30d: 1,
                raised_by_currency: {},
            },
            error: null,
        });
        const stats = await getCommunityStats();
        expect(mocks.rpc).toHaveBeenCalledWith("community_record_stats");
        expect(mocks.from).not.toHaveBeenCalled();
        expect(stats.storiesPublished).toBe(7);
        expect(stats.correctionsPublished30d).toBe(1);
    });

    it("getCommunityStats degrades to zeros when the RPC errors", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
        const stats = await getCommunityStats();
        expect(stats.storiesPublished).toBe(0);
        expect(stats.raisedHeadlineCurrency).toBeNull();
    });
});

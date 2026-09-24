import { describe, expect, it } from "vitest";
import {
    SLA_CRITICAL_HOURS,
    SLA_WARNING_HOURS,
    oldestPendingHours,
    pctOf,
    publishingTrend,
    slaTone,
} from "./insights";

/**
 * The dashboard's insight helpers are pure on purpose: they drive visual
 * states (SLA tone, trend chips, meter widths) where a wrong number would
 * read as a wrong fact on the admin dashboard.
 */

const NOW = new Date("2026-01-10T05:00:00Z");

describe("the SLA clock", () => {
    it("returns null when nothing is pending or the timestamp is junk", () => {
        expect(oldestPendingHours(null, NOW)).toBeNull();
        expect(oldestPendingHours("not-a-date", NOW)).toBeNull();
    });

    it("measures whole hours since the oldest pending submission", () => {
        expect(oldestPendingHours("2026-01-08T06:30:00Z", NOW)).toBe(46);
        expect(oldestPendingHours("2026-01-10T04:59:00Z", NOW)).toBe(0);
    });

    it("clamps a future timestamp to 0 instead of going negative", () => {
        expect(oldestPendingHours("2026-01-11T00:00:00Z", NOW)).toBe(0);
    });

    it("tones the badge on the warning and critical thresholds", () => {
        expect(slaTone(null)).toBeNull();
        expect(slaTone(0)).toBe("ok");
        expect(slaTone(SLA_WARNING_HOURS - 1)).toBe("ok");
        expect(slaTone(SLA_WARNING_HOURS)).toBe("warning");
        expect(slaTone(SLA_CRITICAL_HOURS - 1)).toBe("warning");
        expect(slaTone(SLA_CRITICAL_HOURS)).toBe("critical");
        expect(slaTone(SLA_CRITICAL_HOURS + 100)).toBe("critical");
    });
});

describe("the publishing trend", () => {
    const series = (previous: number[], current: number[]) => [
        ...previous.map((count, i) => ({ date: `p${i}`, count })),
        ...current.map((count, i) => ({ date: `c${i}`, count })),
    ];

    it("compares the last seven days against the seven before them", () => {
        const trend = publishingTrend(series([1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2]));
        expect(trend.current).toBe(14);
        expect(trend.previous).toBe(7);
        expect(trend.deltaPct).toBe(100);
        expect(trend.positive).toBe(true);
    });

    it("reports a decline as a negative delta with positive=false", () => {
        const trend = publishingTrend(series([4, 4, 4, 4, 4, 4, 4], [2, 2, 2, 2, 2, 2, 2]));
        expect(trend.deltaPct).toBe(-50);
        expect(trend.positive).toBe(false);
    });

    it("has no delta when there is no previous window to compare against", () => {
        expect(publishingTrend([]).deltaPct).toBeNull();
        const short = publishingTrend([
            { date: "a", count: 3 },
            { date: "b", count: 0 },
        ]);
        expect(short.current).toBe(3);
        expect(short.previous).toBe(0);
        expect(short.deltaPct).toBeNull();
    });

    it("is flat, not broken, when both windows are empty", () => {
        const zeros = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, count: 0 }));
        const trend = publishingTrend(zeros);
        expect(trend).toMatchObject({ current: 0, previous: 0, deltaPct: null, positive: true });
    });
});

describe("pctOf", () => {
    it("computes shares and never divides by zero", () => {
        expect(pctOf(25, 100)).toBe(25);
        expect(pctOf(0, 100)).toBe(0);
        expect(pctOf(5, 0)).toBe(0);
        expect(pctOf(5, -3)).toBe(0);
    });

    it("clamps out-of-range inputs instead of overflowing a meter", () => {
        expect(pctOf(150, 100)).toBe(100);
        expect(pctOf(-10, 100)).toBe(0);
    });
});

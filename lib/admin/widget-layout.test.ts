import { describe, expect, it } from "vitest";
import {
    BACK_TO_SCHOOL_STATE_ID,
    BACK_TO_SCHOOL_WIDGET_IDS,
} from "@/lib/platform/back-to-school";
import {
    BASE_WIDGET_IDS,
    DEFAULT_WIDGET_LAYOUTS,
    MAX_WIDGETS,
    WIDGET_IDS,
    defaultWidgetLayout,
    isEducationSeasonActive,
    isEducationWidget,
    isWidgetId,
    resolveWidgetLayout,
    sanitizeWidgetLayout,
    type WidgetId,
} from "./widget-layout";

/**
 * Phase 4.7 — the widget layout rules (spec §35). These are pure functions on
 * purpose: the dashboard's arrangement is validated on write (the save action)
 * and re-derived on read (the page), and a bug in either would only surface as
 * a broken-looking dashboard.
 */

const STAFF_ROLES = ["admin", "editor"] as const;

describe("widget vocabulary", () => {
    it("knows every id it hands out and nothing else", () => {
        for (const id of WIDGET_IDS) expect(isWidgetId(id)).toBe(true);
        expect(isWidgetId("not-a-widget")).toBe(false);
        expect(isWidgetId("")).toBe(false);
        expect(isWidgetId(42)).toBe(false);
        expect(isWidgetId(null)).toBe(false);
        expect(isWidgetId({ id: "platform-health" })).toBe(false);
    });

    it("ships the ten base widgets plus the season's five", () => {
        expect(BASE_WIDGET_IDS).toHaveLength(10);
        expect(BACK_TO_SCHOOL_WIDGET_IDS).toHaveLength(5);
        expect(WIDGET_IDS).toHaveLength(15);
        expect(new Set(WIDGET_IDS).size).toBe(WIDGET_IDS.length);
    });

    it("classifies only the season's ids as seasonal", () => {
        for (const id of BACK_TO_SCHOOL_WIDGET_IDS) expect(isEducationWidget(id)).toBe(true);
        for (const id of BASE_WIDGET_IDS) expect(isEducationWidget(id)).toBe(false);
    });
});

describe("the season switch", () => {
    it("is off outside September with no state lit", () => {
        expect(isEducationSeasonActive(new Date("2026-08-15T12:00:00Z"), [])).toBe(false);
    });

    it("is on inside the September window even before the cron flips the state", () => {
        expect(isEducationSeasonActive(new Date("2026-09-15T12:00:00Z"), [])).toBe(true);
    });

    it("is on whenever an operator activated the state by hand", () => {
        expect(
            isEducationSeasonActive(new Date("2026-07-04T12:00:00Z"), [BACK_TO_SCHOOL_STATE_ID]),
        ).toBe(true);
    });
});

describe("default layouts", () => {
    it("covers the staff roles and stays inside the vocabulary", () => {
        for (const role of STAFF_ROLES) {
            const layout = DEFAULT_WIDGET_LAYOUTS[role];
            expect(layout.length).toBeGreaterThan(0);
            for (const id of layout) expect(isWidgetId(id)).toBe(true);
            expect(new Set(layout).size).toBe(layout.length);
        }
    });

    it("never exceeds the render cap, season or not", () => {
        for (const role of ["admin", "editor", "contributor", "advertiser"] as const) {
            expect(defaultWidgetLayout(role, true).length).toBeLessThanOrEqual(MAX_WIDGETS);
            expect(defaultWidgetLayout(role, false).length).toBeLessThanOrEqual(MAX_WIDGETS);
        }
    });

    it("appends the season's widgets only while the season runs", () => {
        const off = defaultWidgetLayout("editor", false);
        const on = defaultWidgetLayout("editor", true);
        expect(off.some(isEducationWidget)).toBe(false);
        expect(on).toEqual([...off, ...BACK_TO_SCHOOL_WIDGET_IDS]);
    });

    it("leaves contributor and advertiser without a dashboard (no viewDashboard capability)", () => {
        expect(DEFAULT_WIDGET_LAYOUTS.contributor).toEqual([]);
        expect(DEFAULT_WIDGET_LAYOUTS.advertiser).toEqual([]);
    });
});

describe("sanitizeWidgetLayout (write path)", () => {
    it("keeps the submitted order", () => {
        expect(sanitizeWidgetLayout(["photo-archive", "pending-submissions"])).toEqual([
            "photo-archive",
            "pending-submissions",
        ]);
    });

    it("drops ids the registry no longer owns", () => {
        expect(sanitizeWidgetLayout(["platform-health", "retired-widget", 7, null])).toEqual([
            "platform-health",
        ]);
    });

    it("drops duplicates", () => {
        expect(sanitizeWidgetLayout(["active-notices", "active-notices"])).toEqual([
            "active-notices",
        ]);
    });

    it("caps the layout", () => {
        const everything = sanitizeWidgetLayout(WIDGET_IDS);
        expect(everything).toHaveLength(MAX_WIDGETS);
        expect(everything).toEqual(WIDGET_IDS.slice(0, MAX_WIDGETS));
    });

    it("drops the season's widgets once the season is over", () => {
        const stored = ["pending-submissions", ...BACK_TO_SCHOOL_WIDGET_IDS];
        expect(sanitizeWidgetLayout(stored, { seasonActive: false })).toEqual([
            "pending-submissions",
        ]);
        expect(sanitizeWidgetLayout(stored, { seasonActive: true })).toHaveLength(6);
    });
});

describe("resolveWidgetLayout (read path)", () => {
    it("falls back to the role's defaults when no row is stored", () => {
        expect(resolveWidgetLayout(null, "editor", false)).toEqual(
            defaultWidgetLayout("editor", false),
        );
    });

    it("honours a layout the user cleared themselves", () => {
        expect(resolveWidgetLayout([], "admin", false)).toEqual([]);
    });

    it("keeps a saved order and drops what it cannot render", () => {
        const saved = ["photo-archive", "gone", "platform-health"] as string[];
        expect(resolveWidgetLayout(saved, "admin", false)).toEqual([
            "photo-archive",
            "platform-health",
        ]);
    });

    it("restores defaults when sanitization emptied a non-empty layout", () => {
        // Every stored id retired, or only seasonal widgets after the season —
        // either way an empty dashboard would read as a bug, not a choice.
        expect(resolveWidgetLayout(["gone", "also-gone"] as string[], "admin", false)).toEqual(
            defaultWidgetLayout("admin", false),
        );
        expect(resolveWidgetLayout([...BACK_TO_SCHOOL_WIDGET_IDS], "admin", false)).toEqual(
            defaultWidgetLayout("admin", false),
        );
    });

    it("brings the season's widgets back when the season returns", () => {
        const resolved = resolveWidgetLayout(
            [...defaultWidgetLayout("admin", false), "education-stories"] as WidgetId[],
            "admin",
            true,
        );
        expect(resolved).toContain("education-stories");
    });
});

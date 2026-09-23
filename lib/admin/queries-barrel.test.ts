import { describe, expect, it } from "vitest";
import * as barrel from "./queries";

/**
 * W17 — the admin data layer was split from one 2,692-line module into six
 * domain modules behind a barrel. The type checker proves the barrel compiles;
 * this proves it *resolves*: a module that fails to load (or a re-export that
 * stops being wired) would otherwise only surface when an admin page renders.
 */
describe("admin queries barrel (W17 split)", () => {
    it("re-exports the public API of every domain", () => {
        const expected = [
            // content-ops
            "getDashboardStats",
            "getContentItems",
            "getSubmissions",
            // people (users + ads)
            "getUsers",
            "getUserDetail",
            "getAdSlots",
            "getCampaigns",
            "getAdvertisers",
            "getPendingAdInquiries",
            // safety (audit log, storage, trust & safety)
            "getRecentModeration",
            "getReports",
            "getCorrections",
            // catalog (listings, reference data, taxonomy, polls)
            "getListingsAdmin",
            "getLocations",
            "getCategoriesAdmin",
            "getLocationsAdmin",
            "getPollsAdmin",
            // programs (fundraisers, policies, about, advertise)
            "getFundraisersAdmin",
            "getPoliciesAdmin",
            // settings (site settings, digest archive, legal inbox)
            "getSiteSettingsAdmin",
            "getPublicSiteSettings",
            "getDigestIssues",
        ];
        for (const name of expected) {
            expect(typeof (barrel as Record<string, unknown>)[name], `${name} should be exported`).toBe(
                "function",
            );
        }
    });

    it("keeps every read on a fallback path when no database is configured", async () => {
        // hasDatabase() is false in the test env, so these must resolve to their
        // empty shapes rather than throwing — the convention the admin pages rely
        // on during a DB outage.
        await expect(barrel.getUsers({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getCampaigns({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getAdSlots()).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getAdvertisers({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getPendingAdInquiries({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getUserDetail("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
        await expect(barrel.getDashboardStats()).resolves.toBeDefined();
        await expect(barrel.getSubmissions({})).resolves.toBeDefined();
    });
});

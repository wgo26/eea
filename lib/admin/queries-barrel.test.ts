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
            "getPendingSubmissionCount",
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
            // audit (Phase 1.1 system trail)
            "getAuditEvents",
            "getAuditTrail",
            "getAuditFilterOptions",
            "exportAuditTrail",
            // states (Phase 1.2 system state engine + incidents)
            "getActiveStates",
            "getAllStates",
            "getStateById",
            "getStateHistory",
            "getStateSchedules",
            "getRecentStateEvents",
            "getIncidents",
            "getActiveIncident",
            "getIncidentById",
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
            // dashboard (Phase 4.4 operational layer + per-user widget layout)
            "getOperationalAlerts",
            "getSystemHealth",
            "getPublishingActivity",
            "getPrioritizedActions",
            "getEducationSnapshot",
            "getSavedWidgetLayout",
            // notifications (Phase 4.5 notification centre)
            "getAdminNotifications",
            "getUnreadNotificationCounts",
            "getUnreadNotificationTotal",
            // security (Phase 4.6 monitoring)
            "getSecurityEvents",
            "getSecurityCounts",
            "getFailedLoginAttempts",
            "getSuspiciousActivity",
            "getCredentialChanges",
            "categorizeSecurityAction",
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
        await expect(barrel.getPendingSubmissionCount()).resolves.toBe(0);
        await expect(barrel.getSubmissions({})).resolves.toBeDefined();
        // Phase 1.1 — the merged audit trail and its filter dropdowns.
        await expect(barrel.getAuditEvents({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getAuditTrail({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getAuditFilterOptions()).resolves.toEqual({
            actions: [],
            resourceTypes: [],
            entityTypes: [],
            sources: [],
        });
        // Phase 1.2 — the state engine must degrade to "normal operations".
        await expect(barrel.getActiveStates()).resolves.toEqual([]);
        await expect(barrel.getAllStates()).resolves.toEqual([]);
        await expect(barrel.getStateById("CRITICAL")).resolves.toBeNull();
        await expect(barrel.getStateHistory("CRITICAL")).resolves.toEqual([]);
        // Phase 4.1 — the schedule rows that drive the state-schedules cron.
        await expect(barrel.getStateSchedules()).resolves.toEqual([]);
        // Phase 4.3 — the cross-ladder timeline the operational controls show.
        await expect(barrel.getRecentStateEvents()).resolves.toEqual([]);
        await expect(barrel.getIncidents({})).resolves.toEqual({ rows: [], total: 0, openCount: 0 });
        await expect(barrel.getActiveIncident()).resolves.toBeNull();
        await expect(barrel.getIncidentById("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
        // Phase 4.4 — the operational layer must degrade to "nothing needs
        // attention" and the widget layout to "no preference".
        await expect(barrel.getOperationalAlerts()).resolves.toEqual([]);
        await expect(barrel.getSystemHealth()).resolves.toBeDefined();
        await expect(barrel.getPublishingActivity()).resolves.toEqual({ days: [], byType: [], total: 0 });
        await expect(barrel.getEducationSnapshot()).resolves.toEqual({
            categoryCount: 0,
            stories: 0,
            notices: 0,
            communityAlerts: 0,
            upcoming: [],
        });
        await expect(barrel.getSavedWidgetLayout("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
        // Phase 4.5 — the notification centre must degrade to "empty inbox" and
        // a zero badge rather than throwing.
        await expect(
            barrel.getAdminNotifications("00000000-0000-0000-0000-000000000000"),
        ).resolves.toEqual({ rows: [], total: 0 });
        await expect(
            barrel.getUnreadNotificationCounts("00000000-0000-0000-0000-000000000000"),
        ).resolves.toEqual({
            total: 0,
            byCategory: { info: 0, action_required: 0, warning: 0, critical: 0 },
        });
        await expect(
            barrel.getUnreadNotificationTotal("00000000-0000-0000-0000-000000000000"),
        ).resolves.toBe(0);
        // Phase 4.6 — security monitoring degrades to "nothing observed", with
        // the window length still reported so the page can label the range.
        await expect(barrel.getSecurityEvents({})).resolves.toEqual({ rows: [], total: 0 });
        await expect(barrel.getFailedLoginAttempts({ windowDays: 7 })).resolves.toEqual({
            windowDays: 7,
            total: 0,
            blocked: 0,
            uniqueIdentifiers: 0,
            uniqueIps: 0,
            cells: [],
            topIdentifiers: [],
            topIps: [],
            repeated: [],
        });
        await expect(barrel.getSuspiciousActivity({ windowDays: 30 })).resolves.toEqual({
            windowDays: 30,
            bulk: [],
            escalation: [],
            critical: [],
            large: [],
        });
        await expect(barrel.getCredentialChanges()).resolves.toEqual([]);
        await expect(barrel.getSecurityCounts()).resolves.toEqual({
            total: 0,
            auth: 0,
            permissions: 0,
            credentials: 0,
            bulk: 0,
            state: 0,
        });
        expect(barrel.categorizeSecurityAction("report:bulk_delete")).toBe("bulk");
        expect(barrel.categorizeSecurityAction("edit_content")).toBeNull();
        // The ranking is pure, so with no capabilities and nothing pending it
        // must produce no instructions at all.
        expect(
            barrel.getPrioritizedActions({
                capabilities: [],
                alerts: [],
                stats: { pendingSubmissions: 0, scheduled: 0, draftCount: 0 },
                systemStatus: "healthy",
                hasActiveIncident: false,
            }),
        ).toEqual([]);
    });
});

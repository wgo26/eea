import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_TIER,
  ALL_ADMIN_ROLES,
  capabilitiesForAdminRoles,
  effectiveCapabilities,
  resolveAdminRoles,
  roleTierRank,
  rolesInTier,
  topTierRole,
  type AdminRole,
} from "./admin-roles";
import { ALL_CAPABILITIES, type Capability } from "./capabilities";
import type { AppRole } from "./types";

/**
 * The role model the AppShell's identity chip renders from (spec §17).
 *
 * These guards exist because the fine-grained layer is a DISPLAY concern that
 * was never tested: the shell used to label a Chief Administrator "Member"
 * because it read the legacy enum only. Nothing here authorizes anything —
 * guards ask for capabilities — but if the tier map drifts, the console tells
 * staff something untrue about themselves, which is exactly how people end up
 * requesting access they already have.
 */

describe("ADMIN_ROLE_TIER", () => {
    it("covers every admin role, so a new role cannot render tier-less", () => {
        for (const role of ALL_ADMIN_ROLES) {
            expect(ADMIN_ROLE_TIER[role], `${role} needs a tier`).toBeTruthy();
        }
    });

    it("labels every admin role for the badge", () => {
        for (const role of ALL_ADMIN_ROLES) {
            expect(ADMIN_ROLE_LABELS[role].length, `${role} needs a label`).toBeGreaterThan(0);
        }
    });

    it("ranks chief above super above platform, and analyst last", () => {
        expect(roleTierRank("chief_admin")).toBeLessThan(roleTierRank("super_admin"));
        expect(roleTierRank("super_admin")).toBeLessThan(roleTierRank("editorial_admin"));
        expect(roleTierRank("analyst")).toBeGreaterThan(roleTierRank("moderator"));
    });
});

describe("topTierRole", () => {
    it("names the highest tier when several roles are held", () => {
        expect(topTierRole(["moderator", "chief_admin", "analyst"])).toBe("chief_admin");
        expect(topTierRole(["analyst", "platform_admin"])).toBe("platform_admin");
    });

    it("is independent of the order the rows were read in", () => {
        const a: AdminRole[] = ["senior_editor", "super_admin"];
        const b: AdminRole[] = ["super_admin", "senior_editor"];
        expect(topTierRole(a)).toBe(topTierRole(b));
    });

    it("breaks same-tier ties deterministically", () => {
        const forward: AdminRole[] = ["moderator", "media_admin"];
        const reversed: AdminRole[] = ["media_admin", "moderator"];
        expect(topTierRole(forward)).toBe(topTierRole(reversed));
    });

    it("returns null for no roles, so the caller can say something honest", () => {
        expect(topTierRole([])).toBeNull();
    });
});

describe("rolesInTier", () => {
    it("groups the held roles so the +N chip counts correctly", () => {
        const held: AdminRole[] = ["moderator", "media_admin", "chief_admin"];
        expect(rolesInTier(held, "operational")).toEqual(["moderator", "media_admin"]);
        expect(rolesInTier(held, "supreme")).toEqual(["chief_admin"]);
    });
});

describe("supreme tier exclusivity (docs/system/chief-access.md)", () => {
    const SUPREME: Capability[] = ["system.owner", "secrets.reveal"];

    it("grants the supreme capabilities to chief_admin only", () => {
        for (const role of ALL_ADMIN_ROLES) {
            const caps = capabilitiesForAdminRoles([role]);
            for (const cap of SUPREME) {
                expect(caps.has(cap), `${role} must not hold ${cap}`).toBe(role === "chief_admin");
            }
        }
    });

    it("gives chief_admin everything, so ALL_CAPABILITIES is the ladder's top rung", () => {
        const chief = capabilitiesForAdminRoles(["chief_admin"]);
        expect(chief.size).toBe(ALL_CAPABILITIES.length);
    });
});

describe("resolveAdminRoles", () => {
    it("aliases a legacy admin with no rows to super_admin, never to chief", () => {
        expect(resolveAdminRoles(["admin"], [])).toEqual(["super_admin"]);
    });

    it("treats explicit rows as authoritative", () => {
        expect(resolveAdminRoles(["admin"], ["moderator"])).toEqual(["moderator"]);
    });

    it("grants nothing to a member with no roles", () => {
        expect(resolveAdminRoles([], [])).toEqual([]);
    });
});

describe("effectiveCapabilities", () => {
    it("unions both layers so a fine-grained-only admin reaches their pages", () => {
        const roles: AppRole[] = ["editor"];
        const caps = effectiveCapabilities(roles, ["media_admin"]);
        expect(caps.has("media.manage")).toBe(true);
        expect(caps.has("moderate")).toBe(true); // from the legacy editor row
    });

    it("is the legacy map alone with no admin-role rows", () => {
        const caps = effectiveCapabilities(["editor"], []);
        expect(caps.has("manageUsers")).toBe(false);
        expect(caps.has("viewDashboard")).toBe(true);
    });
});

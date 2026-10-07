import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/i18n";
import {
    ACCOUNT_PRIMARY_TABS,
    accountBreadcrumbs,
    buildAccountNavGroups,
    findAccountNavLocation,
    splitAccountNav,
} from "./nav";

const en = getDictionary("en");

describe("buildAccountNavGroups", () => {
    it("groups the five destinations into two ordered sections", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(groups.map((g) => g.key)).toEqual(["activity", "settings"]);
        expect(groups.flatMap((g) => g.items.map((i) => i.key))).toEqual([
            "dashboard",
            "submissions",
            "listings",
            "notices",
            "profile",
        ]);
    });

    it("locale-prefixes every href while keeping the canonical path for matching", () => {
        const groups = buildAccountNavGroups("fr", getDictionary("fr"));
        const listings = groups.flatMap((g) => g.items).find((i) => i.key === "listings");
        expect(listings?.href).toBe("/fr/account/listings");
        expect(listings?.path).toBe("/account/listings");
    });

    it("carries no badges (the notifications center is unlinked in P2)", () => {
        const groups = buildAccountNavGroups("en", en, { unreadNotifications: 4 });
        const items = groups.flatMap((g) => g.items);
        expect(items.every((i) => i.badge === undefined)).toBe(true);
    });
});

describe("splitAccountNav", () => {
    it("shows all five destinations flat with an empty overflow", () => {
        const groups = buildAccountNavGroups("en", en);
        const { tabs, overflow } = splitAccountNav(groups);
        expect(tabs.map((t) => t.key)).toEqual(ACCOUNT_PRIMARY_TABS);
        expect(overflow).toHaveLength(0);
    });

    it("omits an empty group from the overflow menu", () => {
        const groups = buildAccountNavGroups("en", en);
        const { overflow } = splitAccountNav(groups, [
            "dashboard",
            "submissions",
            "listings",
            "notices",
            "profile",
        ]);
        expect(overflow).toHaveLength(0);
    });
});

describe("findAccountNavLocation", () => {
    it("prefers the longest matching path over the /account/dashboard prefix", () => {
        const groups = buildAccountNavGroups("en", en);
        const loc = findAccountNavLocation(groups, "/en/account/submissions");
        expect(loc?.item.key).toBe("submissions");
        expect(loc?.group.key).toBe("activity");
    });

    it("matches nested routes (a listing detail belongs to Listings)", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(findAccountNavLocation(groups, "/en/account/listings/abc-123")?.item.key).toBe("listings");
    });

    it("accepts both canonical and locale-prefixed paths", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(findAccountNavLocation(groups, "/account/profile")?.item.key).toBe("profile");
        expect(findAccountNavLocation(groups, "/en/account/profile")?.item.key).toBe("profile");
    });

    it("returns null for unlinked routes (messages, saved) and outside routes", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(findAccountNavLocation(groups, "/en/account/messages/abc-123")).toBeNull();
        expect(findAccountNavLocation(groups, "/en/account/saved")).toBeNull();
        expect(findAccountNavLocation(groups, "/en/account/login")).toBeNull();
    });
});

describe("accountBreadcrumbs", () => {
    it("collapses to a single label on the dashboard (the area home)", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(accountBreadcrumbs("en", en, groups, "/en/account/dashboard")).toEqual([
            { label: "Dashboard" },
        ]);
    });

    it("links Account and the group, and never the page you are on", () => {
        const groups = buildAccountNavGroups("en", en);
        const trail = accountBreadcrumbs("en", en, groups, "/en/account/listings");
        expect(trail).toHaveLength(3);
        expect(trail[0]).toEqual({ label: "Account", href: "/en/account/dashboard" });
        expect(trail[1]?.href).toBe("/en/account/dashboard");
        expect(trail.at(-1)?.href).toBeUndefined();
    });

    it("falls back to the area label for an unknown route", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(accountBreadcrumbs("en", en, groups, "/en/account/whatever")).toEqual([
            { label: "Account" },
        ]);
    });
});

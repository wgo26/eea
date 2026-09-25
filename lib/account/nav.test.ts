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
    it("groups the ten destinations into three ordered sections", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(groups.map((g) => g.key)).toEqual(["activity", "library", "settings"]);
        expect(groups.flatMap((g) => g.items.map((i) => i.key))).toEqual([
            "dashboard",
            "submissions",
            "listings",
            "messages",
            "saved",
            "follows",
            "recent",
            "profile",
            "notifications",
            "security",
        ]);
    });

    it("locale-prefixes every href while keeping the canonical path for matching", () => {
        const groups = buildAccountNavGroups("fr", getDictionary("fr"));
        const saved = groups.flatMap((g) => g.items).find((i) => i.key === "saved");
        expect(saved?.href).toBe("/fr/account/saved");
        expect(saved?.path).toBe("/account/saved");
    });

    it("decorates only the notifications entry with the unread count", () => {
        const groups = buildAccountNavGroups("en", en, { unreadNotifications: 4 });
        const items = groups.flatMap((g) => g.items);
        expect(items.find((i) => i.key === "notifications")?.badge).toBe(4);
        expect(items.find((i) => i.key === "dashboard")?.badge).toBeUndefined();
    });
});

describe("splitAccountNav", () => {
    it("keeps the bar short: home + one anchor per group, rest overflows", () => {
        const groups = buildAccountNavGroups("en", en);
        const { tabs, overflow } = splitAccountNav(groups);
        expect(tabs.map((t) => t.key)).toEqual(ACCOUNT_PRIMARY_TABS);
        // Every overflowed item stays in its own group, so the menu header is
        // the section label rather than a flat orphan list.
        expect(overflow.map((g) => g.key)).toEqual(["activity", "library", "settings"]);
        expect(overflow.flatMap((g) => g.items.map((i) => i.key))).toEqual([
            "listings",
            "messages",
            "follows",
            "recent",
            "notifications",
            "security",
        ]);
    });

    it("omits an empty group from the overflow menu", () => {
        const groups = buildAccountNavGroups("en", en);
        const { overflow } = splitAccountNav(groups, [
            "dashboard",
            "submissions",
            "listings",
            "messages",
            "saved",
            "follows",
            "recent",
            "profile",
            "notifications",
            "security",
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

    it("matches nested routes (a message thread belongs to Messages)", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(findAccountNavLocation(groups, "/en/account/messages/abc-123")?.item.key).toBe("messages");
    });

    it("accepts both canonical and locale-prefixed paths", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(findAccountNavLocation(groups, "/account/security")?.item.key).toBe("security");
        expect(findAccountNavLocation(groups, "/en/account/security")?.item.key).toBe("security");
    });

    it("returns null for a route outside the nav", () => {
        const groups = buildAccountNavGroups("en", en);
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
        const trail = accountBreadcrumbs("en", en, groups, "/en/account/saved");
        expect(trail).toEqual([
            { label: "Account", href: "/en/account/dashboard" },
            { label: "Library", href: "/en/account/follows" },
            { label: "Reading list" },
        ]);
        expect(trail.at(-1)?.href).toBeUndefined();
    });

    it("falls back to the area label for an unknown route", () => {
        const groups = buildAccountNavGroups("en", en);
        expect(accountBreadcrumbs("en", en, groups, "/en/account/whatever")).toEqual([
            { label: "Account" },
        ]);
    });
});

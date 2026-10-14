import { describe, expect, it } from "vitest";
import {
    str,
    isEmail,
    submissionFingerprint,
    submissionTitleKey,
    validateSubmissionContent,
} from "./abuse";

/**
 * Unit cover for the public-intake validators (audit gap: the critical
 * submit path had no unit tests — only e2e). The DB-backed actions stay in
 * e2e; these pure functions are the server-side twin of the form's
 * `required` attributes, so a regression here is a spam hole.
 */
describe("validateSubmissionContent", () => {
    it("requires `what` for photo stories", () => {
        expect(validateSubmissionContent("photo_story", {})).toBe("missing_content");
        expect(validateSubmissionContent("photo_story", { what: "Fire at the market" })).toBeNull();
    });

    it("requires headline + description for news and culture", () => {
        expect(validateSubmissionContent("news", { headline: "H" })).toBe("missing_content");
        expect(
            validateSubmissionContent("news", { headline: "H", description: "D" }),
        ).toBeNull();
        expect(
            validateSubmissionContent("culture", { headline: "H", description: "D" }),
        ).toBeNull();
    });

    it("requires an allowlisted notice type, and a direction for lost_found", () => {
        expect(validateSubmissionContent("notice", {})).toBe("missing_content");
        expect(
            validateSubmissionContent("notice", { noticeType: "evil_type", item: "I", message: "M" }),
        ).toBe("missing_content");
        // lost_found without a direction is unreviewable.
        expect(
            validateSubmissionContent("notice", {
                noticeType: "lost_found",
                item: "Goat",
                message: "Missing since Tuesday",
            }),
        ).toBe("missing_content");
        expect(
            validateSubmissionContent("notice", {
                noticeType: "lost_found",
                noticeDirection: "lost",
                item: "Goat",
                message: "Missing since Tuesday",
            }),
        ).toBeNull();
        // Non-lost notices need item + message only.
        expect(
            validateSubmissionContent("notice", {
                noticeType: "community_alert",
                item: "Road",
                message: "Closed",
            }),
        ).toBeNull();
    });

    it("requires an allowlisted category + item + description for listings", () => {
        expect(
            validateSubmissionContent("buy_sell", { item: "Phone", description: "Works" }),
        ).toBe("missing_content");
        expect(
            validateSubmissionContent("buy_sell", {
                category: "phones",
                item: "Phone",
                description: "Works",
            }),
        ).toBeNull();
        expect(
            validateSubmissionContent("buy_sell", {
                category: "spaceships",
                item: "Phone",
                description: "Works",
            }),
        ).toBe("missing_content");
    });

    it("rejects unknown submission types", () => {
        expect(validateSubmissionContent("press_release", { what: "x" })).toBe("missing_content");
    });
});

describe("submissionFingerprint", () => {
    it("combines title and body so similar headlines do not collide", () => {
        const a = { headline: "Market fire", description: "Stall 12 burned" };
        const b = { headline: "Market fire", description: "Stall 40 flooded" };
        expect(submissionTitleKey(a)).toBe(submissionTitleKey(b));
        expect(submissionFingerprint(a)).not.toBe(submissionFingerprint(b));
    });

    it("is stable for true double-submits", () => {
        const a = { headline: "Market fire", description: "Stall 12 burned" };
        expect(submissionFingerprint({ ...a })).toBe(submissionFingerprint(a));
    });
});

describe("str / isEmail", () => {
    it("trims strings and coerces non-strings to empty", () => {
        expect(str("  hi  ")).toBe("hi");
        expect(str(null)).toBe("");
    });

    it("validates emails", () => {
        expect(isEmail("a@b.co")).toBe(true);
        expect(isEmail("not-an-email")).toBe(false);
        expect(isEmail("a@b")).toBe(false);
    });
});

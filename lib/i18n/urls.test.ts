import { describe, expect, it } from "vitest";
import {
    acceptLanguageLocale,
    buildAlternates,
    isLocalePrefixed,
    localePath,
    safeNextPath,
} from "./urls";

describe("isLocalePrefixed", () => {
    it("detects en/fr prefixes", () => {
        expect(isLocalePrefixed("/en/news")).toBe(true);
        expect(isLocalePrefixed("/fr")).toBe(true);
        expect(isLocalePrefixed("/news")).toBe(false);
        expect(isLocalePrefixed("/")).toBe(false);
        expect(isLocalePrefixed("/english/news")).toBe(false);
    });
});

describe("localePath", () => {
    it("prefixes canonical paths and is idempotent", () => {
        expect(localePath("en", "/news")).toBe("/en/news");
        expect(localePath("fr", "/")).toBe("/fr");
        expect(localePath("en", "/en/news")).toBe("/en/news");
        expect(localePath("fr", "/en/news")).toBe("/en/news");
    });

    it("passes through external and hash links", () => {
        expect(localePath("en", "https://example.com/x")).toBe("https://example.com/x");
        expect(localePath("en", "//evil.com")).toBe("//evil.com");
        expect(localePath("en", "#section")).toBe("#section");
    });
});

describe("acceptLanguageLocale", () => {
    it("picks the first supported tag, defaults to en", () => {
        expect(acceptLanguageLocale("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
        expect(acceptLanguageLocale("en-US,en;q=0.9")).toBe("en");
        expect(acceptLanguageLocale("de, es;q=0.9")).toBe("en");
        expect(acceptLanguageLocale(null)).toBe("en");
    });
});

describe("safeNextPath", () => {
    it("accepts same-origin absolute paths and re-prefixes with locale", () => {
        expect(safeNextPath("/fr/submit/news", "fr")).toBe("/fr/submit/news");
        expect(safeNextPath("/submit/news", "fr")).toBe("/fr/submit/news");
        expect(safeNextPath("/account/dashboard?tab=1", "en")).toBe(
            "/en/account/dashboard?tab=1",
        );
    });

    it("rejects open redirects and non-page targets", () => {
        expect(safeNextPath("https://evil.com", "en")).toBeNull();
        expect(safeNextPath("//evil.com", "en")).toBeNull();
        expect(safeNextPath("/api/uploads", "en")).toBeNull();
        expect(safeNextPath("/_next/static/x.js", "en")).toBeNull();
        expect(safeNextPath("/photo.jpg", "en")).toBeNull();
        expect(safeNextPath("relative/path", "en")).toBeNull();
        expect(safeNextPath("/a\\b", "en")).toBeNull();
        expect(safeNextPath(null, "en")).toBeNull();
        expect(safeNextPath("", "en")).toBeNull();
    });
});

describe("buildAlternates", () => {
    it("emits canonical + en/fr/x-default", () => {
        const fr = buildAlternates("fr", "/news");
        expect(fr.canonical).toBe("/fr/news");
        expect(fr.languages).toEqual({
            en: "/en/news",
            fr: "/fr/news",
            "x-default": "/en/news",
        });
        expect(buildAlternates("en", "/").canonical).toBe("/en");
    });
});

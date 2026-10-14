import { describe, expect, it } from "vitest";
import { pidginShareLine } from "./pidgin";

describe("pidginShareLine", () => {
    it("frames each content type in street voice", () => {
        expect(pidginShareLine("Market fire", "news")).toBe(
            "📰 Market fire — read di full gist 👇",
        );
        expect(pidginShareLine("Lost goat", "notice")).toBe(
            "📢 Lost goat — check dis notice 👇",
        );
        expect(pidginShareLine("iPhone 12", "listing")).toBe(
            "🛍️ iPhone 12 — see dis item 👇",
        );
        expect(pidginShareLine("Festival", "culture")).toBe(
            "🎭 Festival — check am out 👇",
        );
        expect(pidginShareLine("Mankon at dawn", "photo_story")).toBe(
            "📸 Mankon at dawn — see di photos 👇",
        );
    });

    it("falls back to a generic line without a type", () => {
        expect(pidginShareLine("Something")).toBe("👀 Something — see wetin dey happen 👇");
        expect(pidginShareLine("   ")).toBe("👀 See wetin dey happen 👇");
    });

    it("collapses whitespace and truncates long titles", () => {
        const line = pidginShareLine(`  Too   much\nspace  `, "news");
        expect(line).toBe("📰 Too much space — read di full gist 👇");
        const long = pidginShareLine("x".repeat(500), "news");
        expect(long.length).toBeLessThanOrEqual("📰  — read di full gist 👇".length + 140);
    });
});

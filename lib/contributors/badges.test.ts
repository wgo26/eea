import { describe, expect, it } from "vitest";

import { earnedBadges } from "./badges";

describe("contributor badges (W22)", () => {
    it("awards nothing to empty profiles", () => {
        expect(earnedBadges(0, 0)).toEqual([]);
    });

    it("walks the story tiers in order", () => {
        expect(earnedBadges(1, 0).map((b) => b.id)).toEqual(["first-story"]);
        expect(earnedBadges(5, 0).map((b) => b.id)).toEqual(["first-story", "voice"]);
        expect(earnedBadges(20, 0).map((b) => b.id)).toEqual(["first-story", "voice", "pillar"]);
    });

    it("awards the visual badge on photographs alone", () => {
        expect(earnedBadges(0, 10).map((b) => b.id)).toEqual(["visual-eye"]);
    });

    it("clamps nonsense inputs", () => {
        expect(earnedBadges(-3, Number.NaN)).toEqual([]);
    });
});

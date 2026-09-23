import { describe, expect, it } from "vitest";

import { normalizeShareVoice, resolveShareVoice, shareVoiceSurface } from "./share-voice";

describe("share-voice measurement (W21)", () => {
    it("normalizes article voice types, defaulting to formal", () => {
        expect(normalizeShareVoice("pidgin")).toBe("pidgin");
        expect(normalizeShareVoice("camfranglais")).toBe("camfranglais");
        expect(normalizeShareVoice("formal")).toBe("formal");
        expect(normalizeShareVoice(null)).toBe("formal");
        expect(normalizeShareVoice(undefined)).toBe("formal");
        expect(normalizeShareVoice("PIDGIN")).toBe("pidgin");
        expect(normalizeShareVoice("yoruba")).toBe("formal");
        expect(normalizeShareVoice("")).toBe("formal");
    });

    it("resolves tap voices without guessing", () => {
        // No share line: the formal title travels — always formal.
        expect(resolveShareVoice(null, null)).toBe("formal");
        expect(resolveShareVoice("  ", "pidgin")).toBe("formal");
        // Explicit registers are trusted (case-insensitive).
        expect(resolveShareVoice("See dis tori!", "pidgin")).toBe("pidgin");
        expect(resolveShareVoice("Voir ça", "formal")).toBe("formal");
        expect(resolveShareVoice("Voir ça", "CAMFRANGLAIS")).toBe("camfranglais");
        // Share line with no voice recorded: ambiguous, must skip.
        expect(resolveShareVoice("See dis tori!", null)).toBeNull();
        expect(resolveShareVoice("See dis tori!", undefined)).toBeNull();
        expect(resolveShareVoice("See dis tori!", "")).toBeNull();
        expect(resolveShareVoice("See dis tori!", "yoruba")).toBeNull();
    });

    it("maps voices to aggregate analytics surfaces", () => {
        expect(shareVoiceSurface("pidgin")).toBe("share-pidgin");
        expect(shareVoiceSurface("camfranglais")).toBe("share-camfranglais");
        expect(shareVoiceSurface("formal")).toBe("share-formal");
    });
});

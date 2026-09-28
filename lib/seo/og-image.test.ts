import { describe, expect, it } from "vitest";

import { sanitizeOgText } from "./og-image";

/**
 * OG-text sanitization (CVE-2026-94545 hardening).
 *
 * Article titles and category names are contributor-influenced strings that
 * flow into the Node.js `ImageResponse` pipeline. The patched runtime
 * (next@16.3.6) is the real fix; this pins the defense-in-depth rule that
 * nothing tag-shaped ever reaches that pipeline, so a future regression
 * upstream cannot turn a crafted story title into markup again.
 */
describe("sanitizeOgText", () => {
  it("strips angle brackets (tag-injection vector)", () => {
    expect(sanitizeOgText('<svg onload="x">hi</svg>')).toBe('svg onload="x"hi/svg');
    expect(sanitizeOgText("a < b > c")).toBe("a b c");
  });

  it("preserves legitimate title characters", () => {
    expect(sanitizeOgText("Q&A: l'élection à 100%")).toBe("Q&A: l'élection à 100%");
  });

  it("strips control characters and collapses whitespace", () => {
    expect(sanitizeOgText("a\u0000b\n\n  c")).toBe("ab c");
  });

  it("handles empty input", () => {
    expect(sanitizeOgText("")).toBe("");
  });
});

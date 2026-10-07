import { describe, expect, it } from "vitest";
import { htmlToText, writingStats } from "./stats";

describe("writingStats", () => {
  it("strips tags before counting", () => {
    expect(htmlToText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
    const s = writingStats("<p>Hello world</p>");
    expect(s.words).toBe(2);
    expect(s.characters).toBe(11);
    expect(s.readingMinutes).toBe(1);
  });

  it("handles empty bodies", () => {
    const s = writingStats("");
    expect(s).toMatchObject({ words: 0, characters: 0, readingMinutes: 0, progressPct: 0 });
  });

  it("caps progress at 100", () => {
    const s = writingStats(`<p>${"word ".repeat(2000)}</p>`);
    expect(s.progressPct).toBe(100);
    expect(s.readingMinutes).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { appendAfterAnchor, isUsableSelection, replaceSelectionHtml } from "./selection";

describe("selection helpers", () => {
  it("rejects empty selections (cost honesty)", () => {
    expect(isUsableSelection("")).toBe(false);
    expect(isUsableSelection("<p>hi</p>")).toBe(false);
    expect(isUsableSelection("<p>hello world</p>")).toBe(true);
  });

  it("replaces the selected slice, leaves body intact otherwise", () => {
    expect(replaceSelectionHtml("<p>aaa bbb</p>", "aaa", "<p>ccc</p>")).toBe("<p><p>ccc</p> bbb</p>");
    expect(replaceSelectionHtml("<p>aaa</p>", "zzz", "<p>ccc</p>")).toBe("<p>aaa</p>");
  });

  it("appends completion output", () => {
    expect(appendAfterAnchor("<p>a</p>", "", "<p>b</p>")).toBe("<p>a</p>\n<p>b</p>");
  });
});

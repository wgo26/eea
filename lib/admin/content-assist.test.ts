import { describe, expect, it } from "vitest";

import {
  serializeStoryBlocks,
  suggestExcerpt,
  suggestSeoDescription,
  suggestShareText,
  suggestSlug,
  suggestTags,
} from "./content-assist";

describe("content smart-assist", () => {
  it("drafts an excerpt from the first body sentence", () => {
    const excerpt = suggestExcerpt("<p>Yaounde hosts the festival this weekend. Second sentence here.</p>");
    expect(excerpt).toContain("Yaounde hosts the festival");
    expect(excerpt.length).toBeLessThanOrEqual(280);
  });

  it("returns empty excerpt for empty bodies", () => {
    expect(suggestExcerpt("   ")).toBe("");
    expect(suggestExcerpt("<p></p>")).toBe("");
  });

  it("keeps SEO descriptions within the search budget", () => {
    const seo = suggestSeoDescription("A very long title ".repeat(20), "excerpt ".repeat(50));
    expect(seo.length).toBeLessThanOrEqual(160);
  });

  it("slugifies titles", () => {
    expect(suggestSlug("Café de Yaoundé — 2026!")).toBe("cafe-de-yaounde-2026");
    expect(suggestSlug("!!!")).toBe("story");
  });

  it("caps share text at the WhatsApp budget", () => {
    const long = suggestShareText("x".repeat(400), "");
    expect(long.length).toBeLessThanOrEqual(280);
    expect(long.endsWith("…")).toBe(true);
    expect(suggestShareText("Short title", "")).toBe("Short title");
  });

  it("extracts keyword tags, skipping stop words and existing tags", () => {
    const tags = suggestTags("Bamenda Market Fire Recovery", "Traders in Bamenda market rebuild stalls after the fire outbreak", ["bamenda"]);
    expect(tags).not.toContain("bamenda");
    expect(tags).not.toContain("the");
    expect(tags.length).toBeLessThanOrEqual(8);
    expect(tags).toContain("market");
  });
});

describe("serializeStoryBlocks", () => {
  it("pairs headings with images and paragraphs using sanitizer-safe tags", () => {
    const html = serializeStoryBlocks([
      {
        id: "1",
        heading: "The market at dawn",
        body: "Traders arrive early.\nSecond line.",
        imageUrl: "https://example.com/photo.jpg",
        imageAlt: "",
        imageCaption: "Dawn at the market",
        layout: "image-top",
      },
    ]);
    expect(html).toContain("<h2>The market at dawn</h2>");
    expect(html).toContain('<figure><img src="https://example.com/photo.jpg"');
    expect(html).toContain("<figcaption>Dawn at the market</figcaption>");
    expect(html).toContain("<p>Traders arrive early.</p>");
    expect(html).not.toContain("<script");
  });

  it("rejects non-http image URLs and escapes markup", () => {
    const html = serializeStoryBlocks([
      {
        id: "1",
        heading: "<script>alert(1)</script>",
        body: "ok",
        imageUrl: "javascript:alert(1)",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
      },
    ]);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
  });

  it("skips fully empty blocks", () => {
    expect(
      serializeStoryBlocks([
        { id: "1", heading: "", body: "", imageUrl: "", imageAlt: "", imageCaption: "", layout: "image-top" },
      ]),
    ).toBe("");
  });
});

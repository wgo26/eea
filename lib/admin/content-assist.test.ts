import { describe, expect, it } from "vitest";

import {
  bodyHasStoryBlocks,
  extractYouTubeThumbnail,
  mergeStoryBlocksIntoBody,
  serializeStoryBlocks,
  stripStoryBlocksFromBody,
  suggestExcerpt,
  suggestExcerptFromBlocks,
  suggestSeoDescription,
  suggestShareText,
  suggestSlug,
  suggestTags,
  wrapStoryBlocksHtml,
  type StoryBlock,
} from "./content-assist";

/** Minimal block with the required fields filled in (tests override per case). */
function block(partial: Partial<StoryBlock> & { type: StoryBlock["type"] }): StoryBlock {
  return {
    id: "b1",
    heading: "",
    body: "",
    imageUrl: "",
    imageAlt: "",
    imageCaption: "",
    layout: "image-top",
    ...partial,
  };
}

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
        type: "image",
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
        type: "image",
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
        { id: "1", type: "text", heading: "", body: "", imageUrl: "", imageAlt: "", imageCaption: "", layout: "image-top" },
      ]),
    ).toBe("");
  });

  it("embeds a YouTube video as a real player", () => {
    const html = serializeStoryBlocks([
      block({
        type: "video",
        heading: "Watch this",
        body: "A great video.",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    ]);
    expect(html).toContain("<h2>Watch this</h2>");
    // Canonical embed URL — the only shape the sanitizer's embed allowlist
    // accepts, so the player survives the save round-trip.
    expect(html).toContain('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    // data-* is stripped by sanitize-html — the old markup rendered empty.
    expect(html).not.toContain("data-video-url");
  });

  it("embeds a Vimeo video as a real player", () => {
    const html = serializeStoryBlocks([
      block({ type: "video", heading: "V", videoUrl: "https://vimeo.com/123456789" }),
    ]);
    expect(html).toContain('<iframe src="https://player.vimeo.com/video/123456789"');
  });

  it("uses a native player for an uploaded clip", () => {
    const html = serializeStoryBlocks([
      block({ type: "video", heading: "Clip", videoUrl: "https://cdn.example/a.mp4" }),
    ]);
    // click-to-play: preload="none" keeps the low-bandwidth promise.
    expect(html).toContain('<video src="https://cdn.example/a.mp4" controls preload="none" playsinline>');
    expect(html).not.toContain("<iframe");
  });

  it("falls back to a thumbnail link for an unembeddable host", () => {
    const html = serializeStoryBlocks([
      block({
        type: "video",
        heading: "Watch",
        videoUrl: "https://www.dailymotion.com/video/x7f",
        videoThumbnail: "https://cdn.example/pose.jpg",
      }),
    ]);
    // An iframe here would be deleted by the sanitizer; a link always works.
    expect(html).not.toContain("<iframe");
    expect(html).toContain('<a href="https://www.dailymotion.com/video/x7f"');
    expect(html).toContain("https://cdn.example/pose.jpg");
  });

  it("drops a video block whose URL is not http(s)", () => {
    expect(
      serializeStoryBlocks([block({ type: "video", videoUrl: "javascript:alert(1)" })]),
    ).not.toContain("javascript:");
  });

  it("serializes gallery, cta, and divider blocks", () => {
    const html = serializeStoryBlocks([
      {
        id: "1",
        type: "gallery",
        heading: "Photos",
        body: "",
        imageUrl: "",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
        galleryImages: [{ url: "https://example.com/1.jpg" }, { url: "https://example.com/2.jpg" }],
      },
      {
        id: "2",
        type: "cta",
        heading: "",
        body: "Support us",
        imageUrl: "",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
        ctaText: "Donate",
        ctaLink: "https://example.com/donate",
      },
      {
        id: "3",
        type: "divider",
        heading: "",
        body: "",
        imageUrl: "",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
      },
    ]);
    expect(html).toContain("gallery-grid");
    expect(html).toContain("content-cta");
    expect(html).toContain("content-divider");
  });

  it("degrades a CTA with no usable link to text instead of a dead anchor", () => {
    const html = serializeStoryBlocks([
      block({ type: "cta", ctaText: "Read more", ctaLink: "" }),
    ]);
    expect(html).not.toContain("<a ");
    expect(html).toContain('class="cta-text"');
  });
});

describe("story blocks survive the project HTML sanitizer", () => {
  // The serializer's contract is that its output is what readers actually see
  // after lib/security/html.ts runs on save. These assertions failed for the
  // video (data-* stripped -> empty div) and gallery (no styles existed) blocks.
  const allBlocks: StoryBlock[] = [
    block({ type: "text", heading: "Intro", body: "First line.\nSecond line." }),
    block({
      type: "image",
      heading: "Market dawn",
      body: "Traders arrive early.",
      imageUrl: "https://cdn.example/1.jpg",
      imageCaption: "Dawn at the market",
      layout: "image-left",
    }),
    block({
      type: "gallery",
      heading: "More frames",
      galleryImages: [
        { url: "https://cdn.example/2.jpg", alt: "Two", caption: "Second" },
        { url: "https://cdn.example/3.jpg" },
      ],
    }),
    block({
      type: "video",
      heading: "Watch",
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
      videoCaption: "The clip",
    }),
    block({ type: "cta", ctaText: "Donate", ctaLink: "https://example.org/donate" }),
    block({ type: "divider" }),
  ];

  it("keeps every block's markup and text through sanitizeBodyHtml", async () => {
    const { sanitizeBodyHtml } = await import("@/lib/security/html");
    const cleaned = sanitizeBodyHtml(
      mergeStoryBlocksIntoBody("Prose lead.", serializeStoryBlocks(allBlocks)),
    );
    expect(cleaned).toBeTruthy();
    const html = cleaned ?? "";

    expect(html).toContain("Prose lead.");
    expect(html).toContain('<div class="story-blocks"');
    expect(html).toContain("<h2>Intro</h2>");
    expect(html).toContain("<h2>Market dawn</h2>");
    expect(html).toContain("<figcaption>Dawn at the market</figcaption>");
    expect(html).toContain('<div class="gallery-grid"');
    expect(html).toContain("https://cdn.example/3.jpg");
    expect(html).toContain('class="story-video"');
    // The player must survive sanitizing as an actual iframe, not be dropped.
    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(html).toContain("https://example.org/donate");
    expect(html).toContain('<hr class="content-divider"');

    // The gallery must still be identifiable as a gallery after sanitizing.
    expect(html).toMatch(/class="gallery-grid"[\s\S]*https:\/\/cdn\.example\/2\.jpg/);
    // Lazy loading survives (value-restricted allowlist in lib/security/html.ts).
    expect(html).toContain('loading="lazy"');
  });

  it("is unchanged by a second sanitize pass", async () => {
    const { sanitizeBodyHtml } = await import("@/lib/security/html");
    const merged = mergeStoryBlocksIntoBody("Lead.", serializeStoryBlocks(allBlocks));
    const once = sanitizeBodyHtml(merged);
    expect(sanitizeBodyHtml(once)).toBe(once);
  });

  it("is detected as HTML so plain-text renderers cannot leak the tags", async () => {
    const { isHtmlBody } = await import("@/lib/news/article-body");
    expect(isHtmlBody(serializeStoryBlocks(allBlocks))).toBe(true);
    expect(isHtmlBody("Just a plain paragraph.")).toBe(false);
    // Prose containing a bare comparison must not be mistaken for markup.
    expect(isHtmlBody("Revenue grew, p<1% of GDP.")).toBe(false);
  });
});

describe("mergeStoryBlocksIntoBody", () => {
  const blocks = [
    block({ type: "text", heading: "One", body: "Body one." }),
    block({
      type: "gallery",
      galleryImages: [{ url: "https://cdn.example/a.jpg" }, { url: "https://cdn.example/b.jpg" }],
    }),
  ];
  const html = serializeStoryBlocks(blocks);

  it("appends sections after existing prose", () => {
    const out = mergeStoryBlocksIntoBody("Lead paragraph.", html);
    expect(out.startsWith("Lead paragraph.")).toBe(true);
    expect(out).toContain('<div class="story-blocks">');
  });

  it("is idempotent: inserting the same sections twice leaves one copy", () => {
    const once = mergeStoryBlocksIntoBody("Lead paragraph.", html);
    expect(mergeStoryBlocksIntoBody(once, html)).toBe(once);
    expect(once.match(/class="story-blocks"/g)).toHaveLength(1);
  });

  it("never nests two wrappers when handed already-wrapped output", () => {
    const wrapped = wrapStoryBlocksHtml(html);
    // Re-wrapping is a no-op, and the section content is preserved inside it.
    expect(wrapStoryBlocksHtml(wrapped)).toBe(wrapped);
    expect(wrapped).toContain("Body one.");
    expect(wrapped.match(/class="story-blocks"/g)).toHaveLength(1);
  });

  it("replaces sections in place when the blocks are edited", () => {
    const first = mergeStoryBlocksIntoBody("Lead.", html);
    const edited = serializeStoryBlocks([block({ type: "text", heading: "Two", body: "Rewritten." })]);
    const second = mergeStoryBlocksIntoBody(first, edited);
    expect(second).toContain("Rewritten.");
    expect(second).not.toContain("Body one.");
    expect(second.match(/class="story-blocks"/g)).toHaveLength(1);
    expect(second.startsWith("Lead.")).toBe(true);
  });

  it("collapses the duplicate copies the old append-only behaviour created", () => {
    const legacy = `${mergeStoryBlocksIntoBody("Lead.", html)}\n\n${wrapStoryBlocksHtml(html)}`;
    const fixed = mergeStoryBlocksIntoBody(legacy, html);
    expect(fixed.match(/class="story-blocks"/g)).toHaveLength(1);
    expect(fixed).toContain("Lead.");
  });

  it("handles empty bodies and empty blocks without stray markup", () => {
    expect(mergeStoryBlocksIntoBody("", html)).toBe(wrapStoryBlocksHtml(html));
    expect(mergeStoryBlocksIntoBody("Prose.", "")).toBe("Prose.");
    expect(mergeStoryBlocksIntoBody("", "")).toBe("");
  });

  it("strips back to prose and reports presence", () => {
    const merged = mergeStoryBlocksIntoBody("Lead.", html);
    expect(bodyHasStoryBlocks(merged)).toBe(true);
    expect(stripStoryBlocksFromBody(merged)).toBe("Lead.");
    expect(bodyHasStoryBlocks("Lead.")).toBe(false);
  });

  it("survives an unbalanced (hand-edited) section wrapper", () => {
    const broken = 'Lead.\n<div class="story-blocks"><h2>Unclosed';
    const out = mergeStoryBlocksIntoBody(broken, html);
    expect(out.match(/class="story-blocks"/g)).toHaveLength(1);
    expect(bodyHasStoryBlocks(stripStoryBlocksFromBody(broken))).toBe(false);
  });
});

describe("extractYouTubeThumbnail", () => {
  it("returns hqdefault thumbnails for watch, short, and embed URLs", () => {
    expect(extractYouTubeThumbnail("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(extractYouTubeThumbnail("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(extractYouTubeThumbnail("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("returns null for non-YouTube URLs", () => {
    expect(extractYouTubeThumbnail("https://example.com/video.mp4")).toBeNull();
    expect(extractYouTubeThumbnail("https://vimeo.com/123")).toBeNull();
  });
});

describe("suggestExcerptFromBlocks", () => {
  it("drafts from a single summary block", () => {
    const excerpt = suggestExcerptFromBlocks([
      {
        id: "1",
        type: "image",
        heading: "The market at dawn",
        body: "Traders arrive early to set up their stalls.",
        imageUrl: "",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
      },
    ]);
    expect(excerpt).toContain("Traders arrive early");
  });

  it("drafts from the densest block when several are used", () => {
    const excerpt = suggestExcerptFromBlocks([
      {
        id: "1",
        type: "text",
        heading: "Short",
        body: "Brief note here.",
        imageUrl: "",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
      },
      {
        id: "2",
        type: "image",
        heading: "The market at dawn",
        body: "Traders arrive early to set up their stalls before sunrise each morning.",
        imageUrl: "",
        imageAlt: "",
        imageCaption: "",
        layout: "image-top",
      },
    ]);
    expect(excerpt).toContain("Traders arrive early");
  });

  it("skips dividers and non-summary blocks", () => {
    expect(
      suggestExcerptFromBlocks([
        {
          id: "1",
          type: "divider",
          heading: "",
          body: "",
          imageUrl: "",
          imageAlt: "",
          imageCaption: "",
          layout: "image-top",
        },
        {
          id: "2",
          type: "text",
          heading: "",
          body: "Hidden detail.",
          imageUrl: "",
          imageAlt: "",
          imageCaption: "",
          layout: "image-top",
          isSummary: false,
        },
      ]),
    ).toBe("");
  });
});

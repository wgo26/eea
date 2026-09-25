import { describe, expect, it } from "vitest";

import { sanitizeBodyHtml } from "@/lib/security/html";
import { isHtmlBody } from "@/lib/news/article-body";

import {
  blocksFromBody,
  blocksEqual,
  createStoryBlock,
  mergeStoryBlocksIntoBody,
  parseStoryBlocks,
  serializeStoryBlocks,
  stripStoryBlocksFromBody,
  type StoryBlock,
} from "./blocks";

/**
 * The contract that makes sections editable rather than write-only:
 * serialize -> (sanitizer) -> parse must return the same document. Without a
 * parser the section editor always opened empty, so "delete this section"
 * meant hand-editing HTML and re-inserting duplicated every picture.
 */

function b(partial: Partial<StoryBlock> & { type: StoryBlock["type"] }): StoryBlock {
  return { ...createStoryBlock(), ...partial };
}

/** serialize -> merge into a prose body, exactly as the form does on insert. */
function stored(blocks: StoryBlock[], prose = ""): string {
  return mergeStoryBlocksIntoBody(prose, serializeStoryBlocks(blocks));
}

describe("parseStoryBlocks round-trips serializeStoryBlocks", () => {
  it("reads back a text section", () => {
    const blocks = [b({ type: "text", heading: "The market at dawn", body: "Traders arrive early.\nSecond line here." })];
    const back = parseStoryBlocks(serializeStoryBlocks(blocks));
    expect(back).toHaveLength(1);
    expect(back[0]?.type).toBe("text");
    expect(back[0]?.heading).toBe("The market at dawn");
    expect(back[0]?.body).toBe("Traders arrive early.\nSecond line here.");
    expect(blocksEqual(blocks, back)).toBe(true);
  });

  it("keeps the heading + figure + prose pairing of an image section", () => {
    const blocks = [
      b({
        type: "image",
        heading: "Grinding pepper",
        imageUrl: "https://cdn.example/a.jpg",
        imageAlt: "Women grinding pepper",
        imageCaption: "Photo by Ada",
        body: "The work starts before sunrise.",
        layout: "image-left",
      }),
    ];
    const back = parseStoryBlocks(serializeStoryBlocks(blocks));
    expect(blocksEqual(blocks, back)).toBe(true);
    expect(back[0]?.layout).toBe("image-left");
  });

  it("reads every gallery photo back in order with its caption", () => {
    const blocks = [
      b({
        type: "gallery",
        heading: "The procession",
        galleryImages: [
          { url: "https://cdn.example/1.jpg", caption: "First" },
          { url: "https://cdn.example/2.jpg", alt: "Drummers", caption: "Second" },
          { url: "https://cdn.example/3.jpg" },
        ],
      }),
    ];
    const back = parseStoryBlocks(serializeStoryBlocks(blocks));
    expect(blocksEqual(blocks, back)).toBe(true);
    expect(back[0]?.galleryImages?.map((i) => i.url)).toEqual([
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
      "https://cdn.example/3.jpg",
    ]);
    expect(back[0]?.galleryImages?.[1]?.alt).toBe("Drummers");
  });

  it("reads back a YouTube embed, an uploaded clip and a voice note", () => {
    const blocks = [
      b({ type: "video", heading: "Watch the rollout", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
      b({ type: "video", videoUrl: "https://cdn.example/clip.mp4", videoCaption: "B-roll" }),
      b({ type: "video", videoUrl: "https://cdn.example/note.mp3" }),
    ];
    const back = parseStoryBlocks(serializeStoryBlocks(blocks));
    expect(back.map((x) => x.type)).toEqual(["video", "video", "video"]);
    expect(back[0]?.videoUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(back[0]?.heading).toBe("Watch the rollout");
    expect(back[1]?.videoUrl).toBe("https://cdn.example/clip.mp4");
    expect(back[1]?.videoCaption).toBe("B-roll");
    expect(back[2]?.videoUrl).toBe("https://cdn.example/note.mp3");
  });

  it("reads back a CTA with a link and the no-link text fallback", () => {
    const blocks = [
      b({ type: "cta", heading: "Support us", body: "Every contribution counts.", ctaText: "Donate", ctaLink: "https://example.com/donate" }),
      b({ type: "cta", ctaText: "Coming soon" }),
    ];
    const back = parseStoryBlocks(serializeStoryBlocks(blocks));
    expect(blocksEqual(blocks, back)).toBe(true);
    expect(back[1]?.ctaLink).toBe("");
  });

  it("keeps dividers in position between sections", () => {
    const blocks = [
      b({ type: "text", heading: "One", body: "First section body." }),
      b({ type: "divider" }),
      b({ type: "text", heading: "Two", body: "Second section body." }),
    ];
    const back = parseStoryBlocks(serializeStoryBlocks(blocks));
    expect(back.map((x) => x.type)).toEqual(["text", "divider", "text"]);
    expect(blocksEqual(blocks, back)).toBe(true);
  });

  it("survives the real sanitizer and the round trip together", () => {
    const blocks = [
      b({ type: "text", heading: "Fête & <script>alert(1)</script>", body: "Quotes \"hi\" & ampersands." }),
      b({ type: "image", heading: "Dusk", imageUrl: "https://cdn.example/dusk.jpg", imageAlt: "Dusk over the valley" }),
      b({ type: "gallery", galleryImages: [{ url: "https://cdn.example/x.jpg", caption: "X" }] }),
      b({ type: "cta", ctaText: "Read more", ctaLink: "https://example.com/more" }),
    ];
    const sanitized = sanitizeBodyHtml(stored(blocks, "Lead paragraph.")) ?? "";
    expect(sanitized).not.toContain("<script");
    expect(isHtmlBody(sanitized)).toBe(true);
    const back = blocksFromBody(sanitized);
    // The injected script is neutralised but the heading's visible words
    // survive, so compare on the parts the editor actually cares about.
    expect(back[0]?.heading).toContain("Fête");
    expect(back[1]?.imageUrl).toBe("https://cdn.example/dusk.jpg");
    expect(back[1]?.imageAlt).toBe("Dusk over the valley");
    expect(back[2]?.galleryImages?.[0]?.url).toBe("https://cdn.example/x.jpg");
    expect(back[3]?.ctaLink).toBe("https://example.com/more");
  });

  it("re-editing a parsed story and re-inserting replaces instead of duplicating", () => {
    const original = [
      b({ type: "text", heading: "One", body: "First." }),
      b({ type: "image", heading: "Two", imageUrl: "https://cdn.example/a.jpg" }),
    ];
    const body = stored(original, "Lead.");
    // Re-open, reorder, delete one, add one — the flow that was impossible
    // while the section list always started empty.
    const reopened = blocksFromBody(body);
    expect(reopened).toHaveLength(2);
    const edited = [reopened[1]!, b({ type: "text", heading: "Three", body: "Added." })];
    const next = mergeStoryBlocksIntoBody(body, serializeStoryBlocks(edited));
    expect(next.match(/class="story-blocks"/g)).toHaveLength(1);
    expect(next).toContain("Added.");
    expect(next).not.toContain("First.");
    expect(next.startsWith("Lead.")).toBe(true);
    expect(blocksFromBody(next).map((x) => x.heading)).toEqual(["Two", "Three"]);
  });
});

describe("blocksFromBody", () => {
  it("returns nothing for prose, so typed text is never rewritten as sections", () => {
    expect(blocksFromBody("Just a plain paragraph.\n\nAnother one.")).toEqual([]);
    expect(blocksFromBody("")).toEqual([]);
  });

  it("returns nothing for HTML the block builder did not write", () => {
    // Blogger imports are HTML but carry no section marker: the editor must not
    // claim to own them, or saving would silently restructure an import.
    expect(blocksFromBody('<div class="separator"><img src="https://cdn.example/i.jpg" /></div>')).toEqual([]);
  });

  it("separates the editor's sections from the prose above them", () => {
    const blocks = [b({ type: "text", heading: "Section", body: "Body." })];
    const body = stored(blocks, "Intro paragraph.");
    expect(stripStoryBlocksFromBody(body)).toBe("Intro paragraph.");
    expect(blocksFromBody(body)).toHaveLength(1);
  });

  it("tolerates hand-edited markup with an unclosed wrapper", () => {
    const back = blocksFromBody('<div class="story-blocks"><h2>Unclosed');
    expect(back).toHaveLength(1);
    expect(back[0]?.heading).toBe("Unclosed");
  });

  it("drops generated placeholder alt text instead of laundering it into copy", () => {
    const blocks = [b({ type: "image", heading: "Market", imageUrl: "https://cdn.example/a.jpg" })];
    const html = serializeStoryBlocks(blocks);
    expect(html).toContain('alt="Market"');
    const back = parseStoryBlocks(html);
    expect(back[0]?.imageAlt).toBe("");
    expect(back[0]?.heading).toBe("Market");
  });
});


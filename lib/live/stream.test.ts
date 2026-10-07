import { describe, expect, it } from "vitest";
import { isAllowedStreamUrl, streamEmbedUrl } from "./stream";

describe("stream helpers", () => {
  it("rewrites YouTube watch/shorts/live URLs to the canonical embed", () => {
    expect(streamEmbedUrl("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(streamEmbedUrl("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(streamEmbedUrl("youtube", "https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("rejects non-stream URLs instead of rendering a broken player", () => {
    expect(streamEmbedUrl("youtube", "https://example.com/video")).toBeNull();
    expect(streamEmbedUrl("youtube", "not a url")).toBeNull();
    expect(isAllowedStreamUrl("youtube", "https://www.youtube.com/watch?v=short")).toBe(false);
  });

  it("builds the Facebook video plugin embed", () => {
    const watch = "https://www.facebook.com/watch/?v=123";
    expect(isAllowedStreamUrl("facebook", watch)).toBe(true);
    expect(streamEmbedUrl("facebook", watch)).toBe(
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(watch)}`,
    );
    expect(streamEmbedUrl("facebook", "https://example.com/x")).toBeNull();
  });

  it("never maps a URL for native ingest", () => {
    expect(streamEmbedUrl("native", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(isAllowedStreamUrl("native", "https://example.com/stream.m3u8")).toBe(false);
  });
});

"use client";

import { type CSSProperties } from "react";
import type { StoryBlock } from "@/lib/content/blocks";

/**
 * Renders a story body the way the public pages do, from the block model
 * rather than from raw HTML.
 *
 * Why not `dangerouslySetInnerHTML`: the admin preview shows *unsaved* form
 * values, and `sanitizeBodyHtml` is server-only (`sanitize-html` is not in the
 * browser bundle, by design — see scripts/verify-anon-bundle.mjs). Rendering
 * parsed blocks as real React elements gives the same visual result with the
 * escaping handled by React, so the preview cannot become an XSS sink that the
 * published page does not have.
 *
 * The class names are the ones app/globals.css already styles for the public
 * article (`.story-blocks`, `.gallery-grid`, `.content-cta`, `.story-video`),
 * so this is a faithful preview by construction: one stylesheet, two hosts.
 * The public page renders sanitized HTML with these classes; this renders the
 * model that produced them.
 */

const FLOAT_LEFT: CSSProperties = { float: "left", maxWidth: "45%", marginRight: "16px", marginBottom: "12px" };
const FLOAT_RIGHT: CSSProperties = { float: "right", maxWidth: "45%", marginLeft: "16px", marginBottom: "12px" };

function figureStyle(layout: StoryBlock["layout"]): CSSProperties | undefined {
  if (layout === "image-left") return FLOAT_LEFT;
  if (layout === "image-right") return FLOAT_RIGHT;
  return undefined;
}

/** Prose split on blank lines or single newlines — mirrors story-body.tsx. */
export function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((block) => block.split("\n"))
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function BlockView({ block }: { block: StoryBlock }) {
  const paragraphs = toParagraphs(block.body);

  switch (block.type) {
    case "divider":
      return <hr className="content-divider" />;

    case "gallery": {
      const images = (block.galleryImages ?? []).filter((i) => i.url);
      return (
        <>
          {block.heading ? <h2>{block.heading}</h2> : null}
          {images.length > 0 ? (
            <div className="gallery-grid">
              {images.map((img, i) => (
                <figure key={`${img.url}-${i}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- preview must show arbitrary external/unsaved URLs */}
                  <img src={img.url} alt={img.alt || img.caption || ""} loading="lazy" />
                  {img.caption ? <figcaption>{img.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : null}
        </>
      );
    }

    case "cta":
      return (
        <div className="content-cta">
          {block.heading ? <h2>{block.heading}</h2> : null}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {block.ctaText ? (
            block.ctaLink ? (
              <a href={block.ctaLink} className="cta-button">
                {block.ctaText}
              </a>
            ) : (
              <p className="cta-text">{block.ctaText}</p>
            )
          ) : null}
        </div>
      );

    case "video": {
      const url = block.videoUrl ?? "";
      const label = block.videoCaption || block.heading || "the video";
      return (
        <>
          {block.heading ? <h2>{block.heading}</h2> : null}
          {url ? (
            <figure className="story-video">
              {/* The preview links out rather than embedding: an iframe would
                  load a third-party player inside the admin dialog. The public
                  page renders the same block as a real player. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- external thumbnail, not optimizable */}
              {block.videoThumbnail ? <img src={block.videoThumbnail} alt="" loading="lazy" /> : null}
              <figcaption>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Watch: {label}
                </a>
              </figcaption>
            </figure>
          ) : null}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </>
      );
    }

    case "image":
      return (
        <>
          {block.heading ? <h2>{block.heading}</h2> : null}
          {block.imageUrl ? (
            <figure style={figureStyle(block.layout)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- unsaved/external URLs cannot go through next/image */}
              <img src={block.imageUrl} alt={block.imageAlt || block.heading || ""} loading="lazy" />
              {block.imageCaption ? <figcaption>{block.imageCaption}</figcaption> : null}
            </figure>
          ) : null}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </>
      );

    default:
      return (
        <>
          {block.heading ? <h2>{block.heading}</h2> : null}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </>
      );
  }
}

export function ArticleBodyView({
  prose,
  blocks,
  className = "",
}: {
  /** Handwritten body text (everything outside the generated region). */
  prose: string;
  /** Parsed sections, rendered after the prose exactly as they are stored. */
  blocks: StoryBlock[];
  className?: string;
}) {
  const paragraphs = toParagraphs(prose);

  if (paragraphs.length === 0 && blocks.length === 0) return null;

  return (
    <div className={className}>
      {paragraphs.length > 0 ? (
        <div className="space-y-6">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}
      {blocks.length > 0 ? (
        <div className={`story-blocks ${paragraphs.length > 0 ? "mt-6" : ""}`}>
          {blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

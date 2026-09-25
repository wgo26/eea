/**
 * Story blocks — the document model behind the content form's section builder.
 *
 * A story body is a text column, so the blocks are stored *as* the markup they
 * derive: `serializeStoryBlocks` writes it and `parseStoryBlocks` reads it back.
 * The two are an exact inverse (asserted by lib/content/blocks.test.ts), which
 * is what makes sections editable instead of write-only — opening an existing
 * story hydrates the editor with real blocks, and re-inserting replaces the
 * previous output rather than appending a second copy of every picture.
 *
 * Why a marker class and not a JSON blob: everything here must survive
 * `sanitizeBodyHtml` (lib/security/html.ts) on the way to the database, and
 * `data-*` attributes do not. The earlier `data-video-url` design was silently
 * deleted on save, which is why the video section rendered as an empty div.
 * `div` + `class` *are* allowlisted, so `<div class="story-blocks">` survives
 * and is the one signal that says "this region is generated; parse it back".
 * The public pages already style everything inside it (app/globals.css), so the
 * admin preview and the reader page render the same markup from the same model.
 *
 * Client-safe: no server-only imports and no `sanitize-html`, so the content
 * form never pulls that dependency into the browser bundle.
 */

export type StoryBlock = {
  id: string;
  /** Section type for modular content building */
  type: "text" | "image" | "video" | "gallery" | "cta" | "divider";
  heading: string;
  body: string;
  imageUrl: string;
  imageAlt: string;
  imageCaption: string;
  /** Visual pairing: image above the text, or floated beside it. */
  layout: "image-top" | "image-left" | "image-right";
  // Video section fields
  videoUrl?: string;
  videoThumbnail?: string;
  videoCaption?: string;
  // Gallery section fields
  galleryImages?: Array<{ url: string; alt?: string; caption?: string }>;
  // CTA section fields
  ctaText?: string;
  ctaLink?: string;
  // Metadata - whether this section contributes to excerpt generation
  isSummary?: boolean;
};

/**
 * Class of the wrapper element around inserted sections. `div` and `class` are
 * both in the sanitizer allowlist, so the marker survives the save round-trip —
 * which an HTML comment would not (sanitize-html drops comments) — and it is
 * what lets "Insert sections into body" replace its own previous output instead
 * of appending a duplicate copy on the second click.
 */
export const STORY_BLOCKS_CLASS = "story-blocks";

/**
 * Placeholder alt texts the serializer emits when a photo has no alt. On parse
 * they are read back as "no alt" so the round trip does not launder a
 * generated string into an editorial one (and so auto-alt can spot the gap).
 */
const GENERIC_IMAGE_ALT = "Story image";
const GENERIC_GALLERY_ALT = "Gallery image";
/** Caption text the serializer substitutes when a clip has no label. */
const GENERIC_VIDEO_LABEL = "the video";

export function createStoryBlock(partial: Partial<StoryBlock> = {}): StoryBlock {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: "image",
    heading: "",
    body: "",
    imageUrl: "",
    imageAlt: "",
    imageCaption: "",
    layout: "image-top",
    isSummary: true,
    ...partial,
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Reverses the escapers above for text read back out of markup. */
function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Plain text of a fragment: tags dropped, entities decoded, whitespace flat. */
function textOf(html: string): string {
  return unescapeHtml(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Reads a named attribute off a tag's attribute string (`class="x"`). */
function attrOf(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs);
  return m ? unescapeHtml(m[1]) : "";
}

function paragraphsOf(body: string): string {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtmlText(p)}</p>`)
    .join("");
}


/**
 * Canonical player URL for a hosted video, or null when the URL is not a player
 * this platform embeds.
 *
 * Only YouTube and Vimeo are returned, because those are the exact two origins
 * the sanitizer accepts (`isAllowedEmbedUrl` in lib/security/html.ts) and the
 * CSP `frame-src` allowlist names (`MEDIA_FRAMES` in lib/security/csp.ts). A
 * third host would be silently deleted on save, so callers must fall back to a
 * link for anything else — which is why this returns null rather than the raw
 * URL. The path shapes here must stay in lockstep with the sanitizer; a
 * regression test asserts the two agree.
 */
export function hostedPlayerUrl(url: string): string | null {
  const raw = url.trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  const yt = raw.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i,
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = raw.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

const DIRECT_VIDEO_EXT = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;
const DIRECT_AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|opus|weba|aac)(\?|#|$)/i;

/** Directly-playable uploaded video file (as opposed to a hosted player page). */
export function isDirectVideoUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && DIRECT_VIDEO_EXT.test(url.trim());
}

/** Directly-playable uploaded audio file (voice note, interview recording). */
export function isDirectAudioUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && DIRECT_AUDIO_EXT.test(url.trim());
}

/** True for any URL a block may legitimately store. */
export function isUsableMediaUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * YouTube thumbnail for any hosted-video URL (watch/shorts/embed), else null.
 * Local to this module for the same bundle reason as `hostedPlayerUrl`.
 */
export function extractYouTubeThumbnail(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i,
  );
  const id = m?.[1] ?? null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/**
 * Poster for a hosted or uploaded clip, used by both the editor preview and the
 * serializer. Vimeo exposes no hotlinkable thumbnail (its API needs a key), so
 * only YouTube resolves — callers must keep working without a poster.
 */
export function mediaPosterUrl(url: string): string | null {
  const raw = url.trim();
  if (!isUsableMediaUrl(raw)) return null;
  return extractYouTubeThumbnail(raw);
}

/**
 * Story blocks → sanitizer-safe HTML. Each block type produces its own
 * structure; only tags in the `sanitizeBodyHtml` allowlist are emitted, so
 * paired text+image sections survive ingestion AND render, gain TOC anchors
 * (h2), and never smuggle interactivity.
 *
 * The shapes written here are the shapes `parseStoryBlocks` reads back. Change
 * one without the other and editing existing stories breaks, so
 * lib/content/blocks.test.ts pins the round trip.
 */
export function serializeStoryBlocks(blocks: StoryBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    const heading = b.heading.trim();
    const body = b.body.trim();

    switch (b.type) {
      case "text":
        if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
        if (body) out.push(paragraphsOf(body));
        break;
      case "image": {
        const img = b.imageUrl.trim();
        if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
        if (img && isUsableMediaUrl(img)) {
          const alt = escapeHtmlAttr(b.imageAlt.trim() || heading || GENERIC_IMAGE_ALT);
          const caption = b.imageCaption.trim();
          const style =
            b.layout === "image-left"
              ? ` style="float: left; max-width: 45%; margin-right: 16px; margin-bottom: 12px;"`
              : b.layout === "image-right"
                ? ` style="float: right; max-width: 45%; margin-left: 16px; margin-bottom: 12px;"`
                : "";
          out.push(
            `<figure${style}><img src="${escapeHtmlAttr(img)}" alt="${alt}" loading="lazy" />${
              caption ? `<figcaption>${escapeHtmlText(caption)}</figcaption>` : ""
            }</figure>`,
          );
        }
        if (body) out.push(paragraphsOf(body));
        if (b.layout !== "image-top" && img) out.push(`<div style="clear: both;"></div>`);
        break;
      }
      case "video": {
        if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
        const videoUrl = b.videoUrl?.trim() ?? "";
        // Only http(s) is emitted: the sanitizer admits https iframes on two
        // origins and http/https/mailto anchors, so anything else is dropped.
        if (isUsableMediaUrl(videoUrl)) {
          const label = b.videoCaption?.trim() || heading || GENERIC_VIDEO_LABEL;
          const thumb = b.videoThumbnail || mediaPosterUrl(videoUrl);
          const player = hostedPlayerUrl(videoUrl);
          const captionHtml = `<figcaption>${
            player
              ? escapeHtmlText(label)
              : `<a href="${escapeHtmlAttr(videoUrl)}">Watch: ${escapeHtmlText(label)}</a>`
          }</figcaption>`;
          if (player) {
            // Real inline player. `normalizeEmbedTag` in lib/security/html.ts
            // rebuilds these attributes on save, so the src must already be a
            // canonical player URL — which is what `hostedPlayerUrl` returns.
            out.push(
              `<figure class="story-video"><iframe src="${escapeHtmlAttr(player)}" title="${escapeHtmlAttr(label)}"></iframe>${captionHtml}</figure>`,
            );
          } else if (isDirectAudioUrl(videoUrl)) {
            // Voice note / interview recording: a native audio player. (Hosted
            // audio pages such as SoundCloud are not embeddable - the CSP
            // frame-src allowlist does not name them - so they fall through to
            // the link branch below.)
            out.push(
              `<figure class="story-audio"><audio src="${escapeHtmlAttr(videoUrl)}" controls preload="none"></audio>${captionHtml}</figure>`,
            );
          } else if (isDirectVideoUrl(videoUrl)) {
            // Uploaded clip: native player, click-to-play (preload="none" keeps
            // the low-bandwidth promise; no autoplay).
            out.push(
              `<figure class="story-video"><video src="${escapeHtmlAttr(videoUrl)}" controls preload="none" playsinline${
                thumb ? ` poster="${escapeHtmlAttr(thumb)}"` : ""
              }></video>${captionHtml}</figure>`,
            );
          } else {
            // Unembeddable host: a link is the honest affordance — an iframe
            // here would be deleted by the sanitizer, and an empty div is what
            // the old data-video-url markup rendered as.
            out.push(
              `<figure class="story-video">${
                thumb ? `<a href="${escapeHtmlAttr(videoUrl)}"><img src="${escapeHtmlAttr(thumb)}" alt="${escapeHtmlAttr(`${label} — video thumbnail`)}" loading="lazy" /></a>` : ""
              }${captionHtml}</figure>`,
            );
          }
        }
        if (body) out.push(paragraphsOf(body));
        break;
      }
      case "gallery": {
        if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
        const images = (b.galleryImages ?? []).filter((img) => isUsableMediaUrl(img.url));
        if (images.length > 0) {
          // `.gallery-grid` is styled in app/globals.css — inline grid styles
          // cannot be used because display/grid-template-columns/gap are not in
          // the sanitizer's allowedStyles list and would be dropped on save.
          out.push(`<div class="gallery-grid">`);
          for (const img of images) {
            const alt = img.alt?.trim() || img.caption?.trim() || GENERIC_GALLERY_ALT;
            out.push(`<figure><img src="${escapeHtmlAttr(img.url)}" alt="${escapeHtmlAttr(alt)}" loading="lazy" />${
              img.caption ? `<figcaption>${escapeHtmlText(img.caption)}</figcaption>` : ""
            }</figure>`);
          }
          out.push(`</div>`);
        }
        break;
      }
      case "cta": {
        const ctaLink = b.ctaLink?.trim() ?? "";
        const ctaText = b.ctaText?.trim() ?? "";
        const usableLink = isUsableMediaUrl(ctaLink);
        out.push(`<div class="content-cta">`);
        if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
        if (body) out.push(paragraphsOf(body));
        if (ctaText) {
          out.push(
            usableLink
              ? `<a href="${escapeHtmlAttr(ctaLink)}" class="cta-button">${escapeHtmlText(ctaText)}</a>`
              : // A button label with no usable target must not render as a
                // dead link — fall back to emphasised text.
                `<p class="cta-text">${escapeHtmlText(ctaText)}</p>`,
          );
        }
        out.push(`</div>`);
        break;
      }
      case "divider":
        out.push(`<hr class="content-divider" />`);
        break;
      default: {
        // Backward compatibility: treat unknown types as image blocks
        const img = b.imageUrl.trim();
        if (heading) out.push(`<h2>${escapeHtmlText(heading)}</h2>`);
        if (isUsableMediaUrl(img)) {
          const alt = escapeHtmlAttr(b.imageAlt.trim() || heading || GENERIC_IMAGE_ALT);
          const caption = b.imageCaption.trim();
          out.push(
            `<figure><img src="${escapeHtmlAttr(img)}" alt="${alt}" loading="lazy" />${
              caption ? `<figcaption>${escapeHtmlText(caption)}</figcaption>` : ""
            }</figure>`,
          );
        }
        if (body) out.push(paragraphsOf(body));
      }
    }
  }
  return out.join("\n");
}

/* --------------------------------------------------------------------------
 * Body composition (the wrapper marker + idempotent insert)
 * ------------------------------------------------------------------------ */

/**
 * True when `html` is exactly one `<div class="story-blocks">...</div>` and
 * nothing outside it. Keeps wrapping idempotent without ever deleting content
 * the way a substring strip would.
 */
function isWrappedInStoryBlocks(html: string): boolean {
  const open = new RegExp(
    `^<div\\b[^>]*class\\s*=\\s*["'][^"']*\\b${STORY_BLOCKS_CLASS}\\b[^"']*["'][^>]*>`,
    "i",
  ).exec(html);
  if (!open) return false;
  // The opening div must close only at the very end of the input.
  return matchingDivEnd(html, 0) === html.length;
}

/**
 * Extract the contents of a body that is exactly one wrapper, so re-wrapping
 * already-inserted output cannot nest two `<div class="story-blocks">`.
 */
function unwrapStoryBlocksHtml(html: string): string {
  const trimmed = html.trim();
  if (!isWrappedInStoryBlocks(trimmed)) return trimmed;
  const open = /<div\b[^>]*>/i.exec(trimmed);
  if (!open) return trimmed;
  return trimmed.slice(open.index + open[0].length, trimmed.lastIndexOf("<")).trim();
}

/** Wraps serialized blocks in the identifiable `<div class="story-blocks">`. */
export function wrapStoryBlocksHtml(blocksHtml: string): string {
  const inner = unwrapStoryBlocksHtml(blocksHtml);
  if (!inner) return "";
  return `<div class="${STORY_BLOCKS_CLASS}">\n${inner}\n</div>`;
}

/**
 * Index of the `</div>` closing the wrapper that starts at `start`, counting
 * nested divs (a gallery block emits its own inner divs). Returns -1 when the
 * markup is unbalanced, so callers can fall back safely.
 */
function matchingDivEnd(html: string, start: number): number {
  const re = /<div\b[^>]*>|<\/div\s*>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    depth += m[0].toLowerCase().startsWith("</div") ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/**
 * Remove every `<div class="story-blocks">...</div>` from a body. Used before a
 * fresh insert so a re-insert can never leave a stale copy behind — including
 * the duplicate copies the old append-only behaviour already wrote into
 * existing content.
 */
export function stripStoryBlocksFromBody(body: string): string {
  const openRe = new RegExp(
    `<div\\b[^>]*class\\s*=\\s*["'][^"']*\\b${STORY_BLOCKS_CLASS}\\b[^"']*["'][^>]*>`,
    "i",
  );
  let out = body;
  let m: RegExpExecArray | null;
  // Always search from the start: `out` shrinks on every replacement.
  while ((m = openRe.exec(out)) !== null) {
    const end = matchingDivEnd(out, m.index);
    const stop = end < 0 ? out.length : end;
    out = out.slice(0, m.index) + out.slice(stop);
  }
  return out.trim();
}

/**
 * Place serialized sections into a body. Idempotent: inserting the same
 * sections twice leaves exactly one copy, and editing a section then
 * re-inserting updates it in place. Sections are appended after any prose the
 * editor already wrote, matching where the builder has always put them.
 */
export function mergeStoryBlocksIntoBody(body: string, blocksHtml: string): string {
  // `blocksHtml` is raw `serializeStoryBlocks` output, which never contains the
  // wrapper itself, so only the body needs stripping.
  const wrapped = wrapStoryBlocksHtml(blocksHtml);
  const prose = stripStoryBlocksFromBody(body);
  if (!wrapped) return prose;
  return prose ? `${prose}\n\n${wrapped}` : wrapped;
}

/** True when a body already carries inserted sections. */
export function bodyHasStoryBlocks(body: string): boolean {
  return new RegExp(
    `<div\\b[^>]*class\\s*=\\s*["'][^"']*\\b${STORY_BLOCKS_CLASS}\\b`,
    "i",
  ).test(body);
}


/* --------------------------------------------------------------------------
 * parseStoryBlocks — HTML back to the model (the round-trip half)
 * ------------------------------------------------------------------------ */

/** A top-level node of a generated region: one section's worth of markup. */
type RegionNode = { tag: "h2" | "figure" | "div" | "hr" | "p"; attrs: string; inner: string };

/**
 * Splits a generated region into top-level nodes with balanced inner content.
 *
 * Deliberately not a real HTML parser: the only input is markup this module
 * wrote (or the sanitizer's output of it), so a tag scanner that counts nesting
 * for `div`/`figure` is sufficient, stays client-safe, and adds no dependency.
 */
function splitTopLevelNodes(html: string): RegionNode[] {
  const nodes: RegionNode[] = [];
  const tagRe = /<(\/?)(h2|figure|div|hr|p)\b([^>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  let open: { tag: string; attrs: string; start: number; depth: number } | null = null;

  while ((m = tagRe.exec(html)) !== null) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? "";
    const selfClosing = m[4] === "/";

    if (open === null) {
      if (closing) continue; // stray close from hand-edited markup: skip it
      if (selfClosing || tag === "hr") {
        nodes.push({ tag: tag as RegionNode["tag"], attrs, inner: "" });
        continue;
      }
      open = { tag, attrs, start: m.index + m[0].length, depth: 1 };
      continue;
    }

    if (open.tag === tag) {
      if (closing) {
        open.depth -= 1;
        if (open.depth === 0) {
          nodes.push({
            tag: open.tag as RegionNode["tag"],
            attrs: open.attrs,
            inner: html.slice(open.start, m.index),
          });
          open = null;
        }
      } else if (!selfClosing) {
        open.depth += 1;
      }
    }
  }

  if (open) {
    // Unbalanced (an editor deleted a closing tag by hand): keep the text
    // rather than silently dropping a whole section.
    nodes.push({ tag: open.tag as RegionNode["tag"], attrs: open.attrs, inner: html.slice(open.start) });
  }
  return nodes;
}

/** The `<img>` of a figure's inner markup plus its figcaption. */
function readFigure(inner: string): { src: string; alt: string; caption: string } {
  const imgTag = /<img\b[^>]*>/i.exec(inner);
  const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption\s*>/i.exec(inner);
  return {
    src: imgTag ? attrOf(imgTag[0], "src") : "",
    alt: imgTag ? attrOf(imgTag[0], "alt") : "",
    caption: cap ? textOf(cap[1]) : "",
  };
}

/** Float direction encoded in an image block's inline style. */
function readLayout(attrs: string): StoryBlock["layout"] {
  const style = attrOf(attrs, "style");
  if (/float\s*:\s*left/i.test(style)) return "image-left";
  if (/float\s*:\s*right/i.test(style)) return "image-right";
  return "image-top";
}

/** Paragraph texts of a fragment, one line apart (the form's textarea shape). */
function readParagraphs(inner: string): string {
  return [...inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)]
    .map((m) => textOf(m[1] ?? ""))
    .filter(Boolean)
    .join("\n");
}

let parseSeq = 0;
/** Editor-only id; regenerated per parse and never persisted. */
function parsedId(): string {
  parseSeq += 1;
  return `parsed-${Date.now().toString(36)}-${parseSeq}`;
}


/**
 * Reads the markup written by `serializeStoryBlocks` back into blocks, so an
 * existing story opens in the section editor already built instead of empty.
 *
 * This is the inverse the form never had: with no parser the editor's block list
 * always started at `[]`, so sections were write-only — deleting or reordering
 * one meant hand-editing HTML. Call it only on a region that carries the wrapper
 * marker (see `blocksFromBody`), because typed prose is not generated markup and
 * guessing at sections would invent structure the editor then overwrites.
 *
 * Round-trip guarantee, pinned by lib/content/blocks.test.ts: for any block list
 * `parseStoryBlocks(serializeStoryBlocks(b))` yields the same sections, fields
 * and order. Ids are regenerated, and the placeholder alt/caption strings the
 * serializer invents are read back as "empty" so a generated string is never
 * laundered into an editorial one.
 */
export function parseStoryBlocks(html: string): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  /** A heading not yet attached to the figure/paragraphs that follow it. */
  let pendingHeading = "";

  function takeHeading(): string {
    const h = pendingHeading;
    pendingHeading = "";
    return h;
  }

  /** Prose node: fills the open heading, or extends the section it follows. */
  function addParagraphs(text: string) {
    if (!text) return;
    if (pendingHeading) {
      blocks.push(createStoryBlock({ id: parsedId(), type: "text", heading: takeHeading(), body: text }));
      return;
    }
    // The serializer writes an image/video section as heading, figure, then
    // paragraphs, so trailing prose belongs to the section that just opened -
    // which is what makes the pairing survive the round trip. (Two adjacent
    // heading-less text blocks merge into one: that grouping is genuinely
    // ambiguous in HTML, and merging keeps every word.)
    const last = blocks[blocks.length - 1];
    if (last && (last.type === "text" || last.type === "image" || last.type === "video")) {
      last.body = last.body ? `${last.body}\n${text}` : text;
      return;
    }
    blocks.push(createStoryBlock({ id: parsedId(), type: "text", body: text }));
  }

  for (const node of splitTopLevelNodes(html)) {
    const cls = attrOf(node.attrs, "class");

    if (node.tag === "hr") {
      if (cls.includes("content-divider")) {
        pendingHeading = "";
        blocks.push(createStoryBlock({ id: parsedId(), type: "divider" }));
      }
      continue;
    }

    if (node.tag === "h2") {
      // A heading opens a section. The serializer always writes it immediately
      // before that section's figure/paragraphs, so it is held rather than
      // pushed — which is what lets an image or video block own its heading.
      pendingHeading = textOf(node.inner);
      continue;
    }

    if (node.tag === "div" && cls.includes("gallery-grid")) {
      const images = [...node.inner.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure\s*>/gi)]
        .map((m) => {
          const fig = readFigure(m[1] ?? "");
          // Alt chain was `alt || caption || "Gallery image"`, so an alt that
          // duplicates the caption was generated, not written.
          const alt =
            fig.alt === GENERIC_GALLERY_ALT || (fig.alt && fig.alt === fig.caption) ? "" : fig.alt;
          return { url: fig.src, alt, caption: fig.caption };
        })
        .filter((i) => i.url);
      blocks.push(
        createStoryBlock({
          id: parsedId(),
          type: "gallery",
          heading: takeHeading(),
          galleryImages: images,
        }),
      );
      continue;
    }

    if (node.tag === "div" && cls.includes("content-cta")) {
      const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/i.exec(node.inner);
      const anchorTag = /<a\b[^>]*class\s*=\s*"cta-button"[^>]*>/i.exec(node.inner);
      const anchorText = /<a\b[^>]*class\s*=\s*"cta-button"[^>]*>([\s\S]*?)<\/a\s*>/i.exec(node.inner);
      const plain = /<p\b[^>]*class\s*=\s*"cta-text"[^>]*>([\s\S]*?)<\/p\s*>/i.exec(node.inner);
      const proseHtml = node.inner.replace(
        /<p\b[^>]*class\s*=\s*"cta-text"[^>]*>[\s\S]*?<\/p\s*>/gi,
        "",
      );
      blocks.push(
        createStoryBlock({
          id: parsedId(),
          type: "cta",
          heading: heading ? textOf(heading[1] ?? "") : takeHeading(),
          body: readParagraphs(proseHtml),
          ctaText: anchorText ? textOf(anchorText[1] ?? "") : plain ? textOf(plain[1] ?? "") : "",
          ctaLink: anchorTag ? attrOf(anchorTag[0], "href") : "",
        }),
      );
      pendingHeading = "";
      continue;
    }

    if (node.tag === "figure") {
      const fig = readFigure(node.inner);
      const isEmbed = /<(iframe|video|audio)\b/i.test(node.inner);

      if (isEmbed) {
        const frame = /<iframe\b[^>]*>/i.exec(node.inner);
        const video = /<video\b[^>]*>/i.exec(node.inner);
        const audio = /<audio\b[^>]*>/i.exec(node.inner);
        const srcTag = frame ?? video ?? audio;
        const url = srcTag ? attrOf(srcTag[0], "src") : "";
        // The serializer writes a bare caption, or "Watch: <label>" for hosts it
        // cannot embed; stripping the prefix reads the label back clean.
        const caption = fig.caption.replace(/^Watch:\s*/i, "");
        const title = frame ? attrOf(frame[0], "title") : "";
        const heading = takeHeading();
        blocks.push(
          createStoryBlock({
            id: parsedId(),
            type: "video",
            heading,
            videoUrl: url,
            videoThumbnail: video ? attrOf(video[0], "poster") : "",
            // `label` was `videoCaption || heading || "the video"`, so a caption
            // that equals the heading is not an editorial caption and an
            // iframe `title` is the same string again - neither round-trips.
            videoCaption:
              caption && caption !== heading && caption !== title && caption !== GENERIC_VIDEO_LABEL
                ? caption
                : "",
            body: "",
          }),
        );
        // `isSummary` is editorial metadata that the markup cannot carry, so it
        // keeps the createStoryBlock default rather than being guessed here.
        continue;
      }

      if (fig.src) {
        const heading = takeHeading();
        blocks.push(
          createStoryBlock({
            id: parsedId(),
            type: "image",
            heading,
            imageUrl: fig.src,
            // The serializer's alt fallback chain was `imageAlt || heading ||
            // "Story image"`, so an alt that is just the heading (or a known
            // placeholder) is not an editorial alt and reads back empty.
            imageAlt: fig.alt === GENERIC_IMAGE_ALT || (fig.alt && fig.alt === heading) ? "" : fig.alt,
            imageCaption: fig.caption,
            layout: readLayout(node.attrs),
          }),
        );
        continue;
      }
      // A figure with no media and no heading carries nothing worth keeping.
      continue;
    }

    if (node.tag === "p") {
      addParagraphs(textOf(node.inner));
      continue;
    }

    if (node.tag === "div") {
      // Float spacers (`clear: both`) hold no content. Any other bare div is
      // legacy markup inside the region: keep its prose rather than dropping it.
      if (/clear\s*:\s*both/i.test(node.attrs)) continue;
      addParagraphs(readParagraphs(node.inner) || textOf(node.inner));
    }
  }

  // A trailing heading with nothing after it is still a section the editor made.
  const leftover = takeHeading();
  if (leftover) {
    blocks.push(createStoryBlock({ id: parsedId(), type: "text", heading: leftover }));
  }

  return blocks.filter(
    (b) =>
      b.type === "divider" ||
      Boolean(b.heading || b.body || b.imageUrl || b.videoUrl || b.ctaText) ||
      (b.galleryImages?.length ?? 0) > 0,
  );
}

/**
 * The section editor's initial state for a stored body: the generated region
 * parsed back into blocks, or `[]` for prose-only bodies.
 */
export function blocksFromBody(body: string): StoryBlock[] {
  if (!bodyHasStoryBlocks(body)) return [];
  const openRe = new RegExp(
    `<div\\b[^>]*class\\s*=\\s*["'][^"']*\\b${STORY_BLOCKS_CLASS}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const m = openRe.exec(body);
  if (!m) return [];
  const contentStart = m.index + m[0].length;
  const end = matchingDivEnd(body, m.index);
  // `matchingDivEnd` reports the index just past the wrapper's `</div>`; -1
  // means hand-edited markup never closed it, so read to the end instead of
  // discarding the section.
  const inner = end < 0 ? body.slice(contentStart) : body.slice(contentStart, end - "</div>".length);
  return parseStoryBlocks(inner);
}

/**
 * True when two block lists describe the same sections, ignoring the
 * editor-only ids. Used by the round-trip test to state the parse/serialize
 * contract precisely rather than comparing whole objects full of noise.
 */
export function blocksEqual(a: StoryBlock[], b: StoryBlock[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as StoryBlock;
    const y = b[i] as StoryBlock;
    if (x.type !== y.type || x.heading !== y.heading || x.body !== y.body) return false;
    if (x.imageUrl !== y.imageUrl || x.imageAlt !== y.imageAlt || x.imageCaption !== y.imageCaption) return false;
    if (x.layout !== y.layout) return false;
    if ((x.videoUrl ?? "") !== (y.videoUrl ?? "")) return false;
    if ((x.videoCaption ?? "") !== (y.videoCaption ?? "")) return false;
    if ((x.ctaText ?? "") !== (y.ctaText ?? "") || (x.ctaLink ?? "") !== (y.ctaLink ?? "")) return false;
    const gx = x.galleryImages ?? [];
    const gy = y.galleryImages ?? [];
    if (gx.length !== gy.length) return false;
    for (let j = 0; j < gx.length; j++) {
      if (gx[j]?.url !== gy[j]?.url) return false;
      if ((gx[j]?.caption ?? "") !== (gy[j]?.caption ?? "")) return false;
    }
  }
  return true;
}



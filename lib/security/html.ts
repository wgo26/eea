/**
 * Shared server-side HTML sanitizer — parser-based allowlist (sanitize-html).
 *
 * Parses untrusted markup with a real HTML tokenizer and rebuilds it from an
 * explicit allowlist of tags, attributes and CSS properties. Anything not
 * allow-listed is dropped: scripts, event handlers, unsafe URL schemes,
 * foreign-content mXSS vectors (svg/math/noscript/template), and interactive
 * elements (forms, iframes, buttons) with their entire content. This replaces
 * the former regex stripper, which was bypassable (mutation XSS, nested-tag
 * smuggling, entity-encoded schemes) and could never prove what it emitted.
 *
 * Used by ad creatives (lib/ads/creatives.ts), by the Blogger ingestion
 * normalizer (lib/admin/blogger.ts), by the admin content save action
 * (lib/admin/actions.ts upsertTranslations), and at every public render
 * boundary for article bodies (news, culture, events, notices). Static markup
 * and a bounded set of inline CSS properties survive; interactivity is
 * intentionally unsupported.
 */

import sanitizeHtmlLib from "sanitize-html";

/** content_translations.body carries up to 500k chars (DB check). */
export const MAX_BODY_HTML_CHARS = 500_000

/** Editorial tags that may survive; everything else is unwrapped or dropped. */
const ALLOWED_TAGS: readonly string[] = [
    "a", "audio", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup",
    "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "iframe", "img", "ins", "li", "mark",
    "ol", "p", "pre", "s", "small", "source", "span", "strike", "strong", "sub",
    "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul", "video",
]

/**
 * Embed origins an article body may load a player from.
 *
 * `<iframe>` is otherwise the single most dangerous tag to allowlist, so it is
 * admitted under a strict origin allowlist that is checked on *every* iframe
 * (see `transformTags` below) rather than trusting the producer: only YouTube
 * and Vimeo, the two hosts already in the CSP `frame-src` allowlist
 * (`MEDIA_FRAMES` in lib/security/csp.ts), and only their canonical player
 * paths. An iframe pointing anywhere else — including a look-alike such as
 * `https://www.youtube.com.evil.test/` — is removed with its content, exactly
 * as before this tag was allowlisted. `<video>`/`<audio>`/`<source>` are inert
 * media elements with no script surface; which hosts can actually serve them is
 * enforced by the CSP `media-src` allowlist, not here.
 */
const EMBED_ORIGINS: readonly string[] = [
    "https://www.youtube.com",
    "https://player.vimeo.com",
];

/** Canonical player paths for `EMBED_ORIGINS`, matched against the parsed URL. */
const EMBED_PATHS: Readonly<Record<string, RegExp>> = {
    "https://www.youtube.com": /^\/embed\/[A-Za-z0-9_-]{11}\/?(?:\?[^\s]*)?$/,
    "https://player.vimeo.com": /^\/video\/\d+\/?(?:\?[^\s]*)?$/,
};

/** True when `raw` is an approved player URL on an approved origin + path. */
export function isAllowedEmbedUrl(raw: string | undefined): boolean {
    if (!raw) return false;
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }
    if (parsed.protocol !== "https:") return false;
    // Rebuild origin from scheme+host only: this is what discards credentials,
    // query-before-path tricks and any port that is not explicitly allowlisted.
    const origin = `${parsed.protocol}//${parsed.host}`;
    if (!EMBED_ORIGINS.includes(origin)) return false;
    return (EMBED_PATHS[origin] ?? /$^/).test(`${parsed.pathname}${parsed.search}`);
}

/** Length units for width/height/margin/padding-style values. */
const MEASURE = String.raw`[-+]?\d*\.?\d+(px|%|em|rem|pt|ch|vw|vh|cm|mm|in|ex)?`

/** CSS properties bodies/creatives may keep, with safe value shapes. */
const STYLE_RULES: Record<string, RegExp> = {
    "text-align": /^(left|center|right|justify|start|end|inherit)$/i,
    float: /^(left|right|none|inherit)$/i,
    clear: /^(left|right|both|none|inherit)$/i,
    width: new RegExp(`^(${MEASURE}|auto|inherit)$`, "i"),
    height: new RegExp(`^(${MEASURE}|auto|inherit)$`, "i"),
    "max-width": new RegExp(`^(${MEASURE}|auto|inherit)$`, "i"),
    "max-height": new RegExp(`^(${MEASURE}|auto|inherit)$`, "i"),
    "margin-left": new RegExp(`^(auto|inherit|${MEASURE})$`, "i"),
    "margin-right": new RegExp(`^(auto|inherit|${MEASURE})$`, "i"),
    "margin-top": new RegExp(`^(auto|inherit|${MEASURE})$`, "i"),
    "margin-bottom": new RegExp(`^(auto|inherit|${MEASURE})$`, "i"),
    margin: new RegExp(`^(auto|inherit|${MEASURE})(\\s+(auto|${MEASURE})){0,3}$`, "i"),
    "padding-left": new RegExp(`^(0|${MEASURE})$`, "i"),
    "padding-right": new RegExp(`^(0|${MEASURE})$`, "i"),
    "padding-top": new RegExp(`^(0|${MEASURE})$`, "i"),
    "padding-bottom": new RegExp(`^(0|${MEASURE})$`, "i"),
    padding: new RegExp(`^(0|${MEASURE})(\\s+(0|${MEASURE})){0,3}$`, "i"),
    color: /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0?\.\d+|1|0)\s*)?\)|transparent|inherit|white|black|red|green|blue|gray|grey|orange|yellow)$/i,
    "background-color": /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0?\.\d+|1|0)\s*)?\)|transparent|inherit|white|black|red|green|blue|gray|grey|orange|yellow)$/i,
    "font-weight": /^(normal|bold|bolder|lighter|[1-9]00|inherit)$/i,
    "font-style": /^(normal|italic|oblique|inherit)$/i,
    "text-decoration": /^(none|underline|overline|line-through|blink|inherit)((\s+)(none|underline|overline|line-through|blink|inherit))*$/i,
    border: /^[\w\s#.,-]+$/i,
    "border-left": /^[\w\s#.,-]+$/i,
    "border-right": /^[\w\s#.,-]+$/i,
    "border-top": /^[\w\s#.,-]+$/i,
    "border-bottom": /^[\w\s#.,-]+$/i,
}

/**
 * sanitize-html expects each property to map to an ARRAY of regexes
 * (it calls .some()). A bare RegExp throws internally and its catch handler
 * silently drops the whole style attribute in Node.
 */
const ALLOWED_STYLES: sanitizeHtmlLib.IOptions["allowedStyles"] = {
    "*": Object.fromEntries(
        Object.entries(STYLE_RULES).map(([prop, re]) => [prop, [re]]),
    ),
}

/**
 * Rebuilds every `<iframe>`'s attributes before the allowlist consults them.
 *
 * Only an approved player URL survives: a disallowed frame is emptied here and
 * then removed WITH its content by `dropDisallowedEmbeds`, so a body can never
 * carry an iframe pointing at an arbitrary origin. Accepted frames get their
 * attributes rebuilt from scratch (only `src` and `title` are carried over), so
 * an input-supplied `srcdoc`, `allow=*`, `onload` or `formaction` cannot reach
 * the output. The `allow` string mirrors
 * components/media/media-attachment.tsx exactly, so an inline embed behaves
 * like the supporting-media player the team already ships.
 */
function normalizeEmbedTag(
    name: string,
    attribs: Record<string, string>,
): { tagName: string; attribs: Record<string, string> } {
    if (name !== "iframe") return { tagName: name, attribs };
    if (!isAllowedEmbedUrl(attribs.src)) return { tagName: name, attribs: {} };
    return {
        tagName: name,
        attribs: {
            src: attribs.src,
            title: attribs.title?.trim() || "Embedded video",
            allow: "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            allowfullscreen: "",
            loading: "lazy",
            referrerpolicy: "strict-origin-when-cross-origin",
        },
    };
}

/**
 * Removes an `<iframe>` together with everything inside it (sanitize-html drops
 * content from the opening tag's position when this returns true) unless its
 * `src` is an approved embed. Renaming the tag instead was tried first and is
 * wrong: `nonTextTags` bookkeeping counts opening/closing names, so a renamed
 * frame leaked a stray `</script>` into the surviving markup.
 */
function dropDisallowedEmbeds(frame: { tag: string; attribs: Record<string, string> }): boolean {
    return frame.tag === "iframe" && !isAllowedEmbedUrl(frame.attribs?.src);
}

const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
    allowedTags: [...ALLOWED_TAGS],
    transformTags: { iframe: normalizeEmbedTag },
    exclusiveFilter: dropDisallowedEmbeds,
    allowedAttributes: {
        // class/dir/style are safe (values are entity-escaped) and preserve
        // Blogger's structural markup (separator divs, dir="ltr", centering).
        "*": ["style", "dir", "class"],
        a: ["href", "title"],
        // `loading` is value-restricted so the story-block builder's lazy
        // images survive (it is emitted on every block <img>); without this the
        // sanitizer drops it and a 20-image story fetches all masters at once.
        img: [
          "src",
          "alt",
          "title",
          "width",
          "height",
          "align",
          "border",
          { name: "loading", values: ["lazy", "eager", "auto"] },
        ],
        th: ["colspan", "rowspan", "align", "valign"],
        td: ["colspan", "rowspan", "align", "valign"],
        ol: ["start", "type"],
        li: ["value"],
        blockquote: ["cite"],
        // Every iframe attribute is either rewritten or pinned by
        // `enforceEmbedPolicy` below, so nothing here is trusted from input.
        iframe: ["src", "title", "width", "height", "loading", "allow",
            "referrerpolicy", "allowfullscreen"],
        video: ["src", "poster", "width", "height", "preload", "controls",
            "loop", "muted", "playsinline"],
        audio: ["src", "preload", "controls", "loop", "muted"],
        source: ["src", "type"],
    },
    allowedStyles: ALLOWED_STYLES,
    // Only plain web/mail schemes; data: URIs are kept out of img src too.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
        img: ["http", "https"],
        iframe: ["https"],
        video: ["http", "https"],
        audio: ["http", "https"],
        source: ["http", "https"],
    },
    allowProtocolRelative: false,
    // Active/foreign/interactive elements are dropped WITH their content —
    // never unwrapped into text — so mXSS carriers (noscript/template/svg)
    // and embedded forms cannot smuggle payload text back into the page.
    // `iframe` is absent because it is allowlisted under `EMBED_ORIGINS` and
    // policed by `enforceEmbedPolicy`; object/embed/frame remain banned.
    nonTextTags: [
        "script", "style", "textarea", "noscript", "template", "svg", "math",
        "object", "embed", "frame", "frameset", "form", "option",
        "select", "button",
    ],
    disallowedTagsMode: "discard",
}

export function sanitizeHtml(raw: string | null | undefined, maxChars: number): string | null {
    if (!raw) return null
    // Bound the parser's input before parsing (the DB column is the real cap).
    const bounded = raw.slice(0, maxChars * 2)
    let html = sanitizeHtmlLib(bounded, SANITIZE_OPTIONS).trim()
    if (!html) return null
    if (html.length > maxChars) {
        html = html.slice(0, maxChars)
        // Never emit a half-written tag at the truncation point.
        const lastOpen = html.lastIndexOf("<")
        const lastClose = html.lastIndexOf(">")
        if (lastOpen > lastClose) html = html.slice(0, lastOpen)
        html = html.trimEnd()
    }
    return html.length > 0 ? html : null
}

/**
 * Sanitized article body for public rendering. Plain text passes through
 * (native drafts) and the size cap matches the DB column so imported bodies
 * are never silently truncated.
 */
export function sanitizeBodyHtml(raw: string | null | undefined): string | null {
    return sanitizeHtml(raw, MAX_BODY_HTML_CHARS)
}
/**
 * Escape a JSON value so it can be safely embedded inside a
 * <script type="application/ld+json"> (or any <script>) without breaking out.
 *
 * JSON.stringify does NOT escape <, >, / or &, so a DB-controlled title such as:
 *
 *   "Eagle Eye Africa </script><script>fetch(...)</script> ..."
 *
 * would, via dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}, terminate
 * the LD container and execute the injected script. This helper escapes <, > and &
 * to their Unicode-escaped forms — enough for any reasonable structured-data parser.
 *
 * Do NOT use this for HTML body content (use sanitizeBodyHtml instead).
 */
export function escapeJsonForLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

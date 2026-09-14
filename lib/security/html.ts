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
    "a", "b", "blockquote", "br", "caption", "center", "code", "col", "colgroup",
    "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "li", "mark",
    "ol", "p", "pre", "s", "small", "span", "strike", "strong", "sub", "sup",
    "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]

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

const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {
        // class/dir/style are safe (values are entity-escaped) and preserve
        // Blogger's structural markup (separator divs, dir="ltr", centering).
        "*": ["style", "dir", "class"],
        a: ["href", "title"],
        img: ["src", "alt", "title", "width", "height", "align", "border"],
        th: ["colspan", "rowspan", "align", "valign"],
        td: ["colspan", "rowspan", "align", "valign"],
        ol: ["start", "type"],
        li: ["value"],
        blockquote: ["cite"],
    },
    allowedStyles: ALLOWED_STYLES,
    // Only plain web/mail schemes; data: URIs are kept out of img src too.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    // Active/foreign/interactive elements are dropped WITH their content —
    // never unwrapped into text — so mXSS carriers (noscript/template/svg)
    // and embedded forms cannot smuggle payload text back into the page.
    nonTextTags: [
        "script", "style", "textarea", "noscript", "template", "svg", "math",
        "iframe", "object", "embed", "frame", "frameset", "form", "option",
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

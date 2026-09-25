/**
 * Article-body enrichment for the news detail page (server-side, XSS-safe).
 *
 * The sanitized Blogger HTML is a flat wall of <p>/<div> blocks — no anchors,
 * no structure for a table of contents, and lead paragraphs that start
 * mid-sentence. This module derives everything from the already-sanitized
 * HTML (it never introduces new markup sources, only wrapper ids/classes):
 *
 * - `extractHeadings` — h2/h3 headings with deterministic slug ids (deduped).
 * - `withHeadingAnchors` — injects those ids into the heading tags so the
 *   TOC can link to `#slug` in-page anchors (localePath-free, audit-clean).
 * - `extractPullQuote` — longest meaty paragraph (60–280 chars) for the
 *   magazine-style pull quote between hero and body.
 * - `dropCapClass` — true for plain-text bodies so the lead paragraph gets
 *   the editorial drop cap.
 */

export type TocHeading = { id: string; text: string; level: 2 | 3 };

/**
 * True when a stored `content_translations.body` carries real markup rather
 * than plain prose. Blogger imports and admin story-block sections are HTML;
 * native drafts are plain text with blank-line paragraph breaks, and the two
 * need different renderers (raw text would leak `<h2>` source to readers,
 * while treating prose as HTML would swallow its line breaks).
 *
 * Shared so every detail page agrees on the detection — the tag list is
 * deliberately anchored (`<\s*` … `\b` … `[^>]*>`) so ordinary prose such as
 * "revenue grew, p<1% of GDP" does not trip it.
 */
export function isHtmlBody(raw: string): boolean {
    return /<\s*(p|div|br|h[1-6]|img|ul|ol|li|blockquote|figure|table|a|hr|span|em|strong|iframe|video|audio|source)\b[^>]*>/i.test(
        raw,
    );
}

function slugifyHeading(text: string, used: Set<string>): string {
    const base =
        text
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff\s-]/g, "")
            .trim()
            .replace(/[\s_-]+/g, "-")
            .slice(0, 60) || "section";
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return slug;
}

/** Plain text of a heading's inner HTML (entities/tags stripped). */
function headingText(inner: string): string {
    return inner
        .replace(/<[^>]*>/g, "")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Collects h2/h3 headings from sanitized body HTML with deterministic ids.
 * Returns [] for flat bodies (no TOC rendered).
 */
export function extractHeadings(html: string): TocHeading[] {
    const used = new Set<string>();
    const out: TocHeading[] = [];
    const re = /<(h[23])\b[^>]*>([\s\S]*?)<\/h[23]\s*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && out.length < 20) {
        const level = m[1].toLowerCase() === "h3" ? 3 : 2;
        const text = headingText(m[2] ?? "");
        if (text.length < 2) continue;
        out.push({ id: slugifyHeading(text, used), text: text.slice(0, 120), level });
    }
    return out;
}

/**
 * Injects the extracted heading ids into the body's h2/h3 tags (in order),
 * preserving existing attributes. Safe to render via dangerouslySetInnerHTML
 * — only adds `id="…"` (slug charset) to tags already present.
 */
export function withHeadingAnchors(html: string, headings: TocHeading[]): string {
    if (headings.length === 0) return html;
    let i = 0;
    return html.replace(/<(h[23])\b([^>]*)>([\s\S]*?)<\/h[23]\s*>/gi, (full, tag: string, attrs: string, inner: string) => {
        if (i >= headings.length) return full;
        const heading = headings[i++];
        const cleanAttrs = String(attrs ?? "").replace(/\s+id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
        return `<${String(tag).toLowerCase()}${cleanAttrs} id="${heading.id}">${inner}</${String(tag).toLowerCase()}>`;
    });
}

/**
 * Picks a pull-quote paragraph: the longest <p> (or <div>) text between 60
 * and 280 chars, skipping photo captions and very short leads. Returns null
 * when the body is too short to warrant one.
 */
export function extractPullQuote(html: string, excerpt: string | null): string | null {
    const candidates: string[] = [];
    const re = /<(p|div)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && candidates.length < 40) {
        const text = headingText(m[2] ?? "");
        if (text.length >= 60 && text.length <= 280 && !/^photo[:\s]/i.test(text)) {
            candidates.push(text);
        }
    }
    if (candidates.length === 0) return null;
    // Prefer the 2nd candidate (skips the lede, mirrors print convention);
    // fall back to the longest when there is only one.
    if (candidates.length === 1) {
        const only = candidates[0];
        if (only === (excerpt ?? "").trim()) return null;
        return only;
    }
    const pick = candidates[1] ?? candidates[0];
    if (pick === (excerpt ?? "").trim()) return candidates[0] ?? null;
    return pick ?? null;
}

/** True when the lead paragraph of a plain-text body deserves a drop cap. */
export function hasDropCapLead(paragraphs: string[]): boolean {
    const first = paragraphs[0] ?? "";
    return first.length >= 120;
}

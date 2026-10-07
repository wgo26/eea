/**
 * Selection helpers for the pro editor's inline AI.
 *
 * The editor's value model stays an HTML string (see lib/content/blocks.ts),
 * so selection AI works on an HTML slice: capture the current range's HTML
 * (or fall back to the caret paragraph), send plain text to the model, and
 * splice the returned HTML back at the same range. All DOM access lives in
 * the component; these pure helpers own the splice/validation policy.
 */

const MAX_SELECTION_CHARS = 8000;

/** Plain-text guard: empty selections cannot spend tokens (cost honesty). */
export function selectionTextOf(htmlSlice: string): string {
  return htmlSlice
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsableSelection(htmlSlice: string): boolean {
  const text = selectionTextOf(htmlSlice);
  return text.length >= 3 && text.length <= MAX_SELECTION_CHARS;
}

/**
 * Replace the FIRST occurrence of `beforeHtml` in `body` with `afterHtml`.
 * The editor passes the exact range HTML it captured, so first-match is the
 * range; when the range cannot be found (concurrent edit) the body is
 * returned unchanged and the caller toasts instead of corrupting prose.
 */
export function replaceSelectionHtml(
  body: string,
  beforeHtml: string,
  afterHtml: string,
): string {
  if (!beforeHtml) return body;
  const idx = body.indexOf(beforeHtml);
  if (idx < 0) return body;
  return body.slice(0, idx) + afterHtml + body.slice(idx + beforeHtml.length);
}

/** Append AI-completed HTML after the given anchor (or at the end). */
export function appendAfterAnchor(body: string, anchorHtml: string, additionHtml: string): string {
  if (!anchorHtml) return body ? `${body}\n${additionHtml}` : additionHtml;
  return replaceSelectionHtml(body, anchorHtml, `${anchorHtml}\n${additionHtml}`);
}

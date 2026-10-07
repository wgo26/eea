/**
 * Pro editor writing stats — pure, client-safe (no sanitize-html).
 *
 * Counts words/chars/read-time off an HTML body string by stripping tags the
 * same way `textOf` does in lib/content/blocks.ts, so the rail numbers match
 * what the reader page renders rather than what the markup weighs.
 */

export type WritingStats = {
  words: number;
  characters: number;
  readingMinutes: number;
  progressPct: number;
};

/** Plain text of an HTML fragment: tags dropped, entities decoded, flat. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const WORDS_PER_MINUTE = 200;
const TARGET_WORDS = 1000;

export function writingStats(html: string): WritingStats {
  const text = htmlToText(html ?? "");
  const words = text ? text.split(/\s+/).length : 0;
  return {
    words,
    characters: text.length,
    readingMinutes: Math.max(words > 0 ? 1 : 0, Math.ceil(words / WORDS_PER_MINUTE)),
    progressPct: Math.min(100, Math.round((words / TARGET_WORDS) * 100)),
  };
}

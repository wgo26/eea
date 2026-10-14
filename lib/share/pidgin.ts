/**
 * Pidgin share-voice fallback (features.md §17: Pidgin/Camfranglais as a
 * *tone* for high-distribution formats, not a third CMS language).
 *
 * When an editor wrote a `share_text`, it always wins (ShareSheet prefers
 * it). When they didn't, WhatsApp + native share fall back to one of these
 * street-voice lines instead of the formal title — so every story,
 * Lost & Found notice and listing shares like a person, not a CMS.
 *
 * Pure + unit-tested. Titles are truncated to 140 chars so the line plus
 * URL stays comfortable inside a WhatsApp bubble.
 */

export type ShareContentType =
    | "news"
    | "photo_story"
    | "notice"
    | "listing"
    | "culture";

const FRAMES: Record<ShareContentType, { emoji: string; hook: string }> = {
    news: { emoji: "📰", hook: "read di full gist" },
    photo_story: { emoji: "📸", hook: "see di photos" },
    notice: { emoji: "📢", hook: "check dis notice" },
    listing: { emoji: "🛍️", hook: "see dis item" },
    culture: { emoji: "🎭", hook: "check am out" },
};

/** Pidgin share line for a story with no editor-written `share_text`. */
export function pidginShareLine(title: string, type?: ShareContentType | null): string {
    const clean = title.trim().replace(/\s+/g, " ").slice(0, 140);
    if (!clean) return "👀 See wetin dey happen 👇";
    const frame = (type && FRAMES[type]) || { emoji: "👀", hook: "see wetin dey happen" };
    return `${frame.emoji} ${clean} — ${frame.hook} 👇`;
}

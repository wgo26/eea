/**
 * Deterministic identifiers for seeded rows.
 *
 * Why uuids from a hash rather than letting Postgres generate them: a seeded row
 * must be re-findable without a round-trip, because
 *   a) re-running a pack must UPDATE the same row, not create a second one, and
 *   b) a later pack needs to point a foreign key at an earlier pack's row.
 * Deriving the id from a stable natural key gives both for free — `ctx.ref()`
 * resolves an FK locally, and a seed run never depends on the insert having come
 * back with a body.
 *
 * `stableUuid` is RFC-4122-shaped (version 4 nibble, variant bits set) so it
 * survives any future server-side uuid validation.
 */

import { createHash } from "node:crypto";

/**
 * A deterministic uuid derived from `key` (sha-256, first 16 bytes, v4-shaped).
 * @param {string} key e.g. "locations/bamenda"
 * @returns {string} canonical lowercase uuid
 */
export function stableUuid(key) {
    const hex = createHash("sha256").update(String(key)).digest("hex").slice(0, 32);
    const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17)}`;
    return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

/**
 * A short stable token for the anonymous-vote tables, which take an opaque
 * browser-held string rather than a uuid (poll_votes.voter_token,
 * content_reactions.reactor_token, ad_events.session_hash).
 * @param {string} key
 * @param {number} [length] clamped to 8–40; reactor_token requires >= 8
 *   (constraint content_reactions_token_check) and ^[A-Za-z0-9-]+$ only.
 * @returns {string}
 */
export function stableToken(key, length = 24) {
    const want = Math.max(8, Math.min(40, Math.trunc(length)));
    return createHash("sha256").update(String(key)).digest("base64url").slice(0, want);
}

/**
 * `base` shifted by `days`, at hour `hour` UTC, normalised to ISO. Relative dates
 * are the convention every existing seeder in this repo uses so the demo content
 * always looks freshly published; `dayOffset` may be negative (past) or positive
 * (scheduled/expiry sweeps).
 * @param {number} days
 * @param {{ base?: Date, hour?: number, minute?: number }} [opts]
 * @returns {string} ISO-8601
 */
export function isoOffset(days, opts = {}) {
    const base = opts.base ?? new Date();
    const at = new Date(base.getTime());
    at.setUTCDate(at.getUTCDate() + days);
    at.setUTCHours(opts.hour ?? 9, opts.minute ?? 15, 0, 0);
    return at.toISOString();
}

/**
 * The UTC calendar date (`YYYY-MM-DD`) `days` from `base`, for the date-typed
 * columns (analytics_daily.day, digest_issues.sent_on, daily_briefs.publish_date,
 * digest_slots.issue_date).
 * @param {number} days
 * @param {{ base?: Date }} [opts]
 */
export function dateOffset(days, opts = {}) {
    const base = opts.base ?? new Date();
    const at = new Date(base.getTime());
    at.setUTCDate(at.getUTCDate() + days);
    return at.toISOString().slice(0, 10);
}

/**
 * A natural-key-derived deterministic uuid. IdMap falls back to exactly this for
 * rows that do not exist yet, so a pack that asks for `ctx.id("locations",
 * "bamenda")` and the row this run inserts agree on the id with no round trip.
 *
 * Values are joined with NUL so a composite key's parts can never be
 * re-arranged into another key's string ("ab|c" vs "a|bc").
 * @param {string} table
 * @param {...(string|number)} keyValues one per key column, in key order
 */
export function naturalId(table, ...keyValues) {
    return stableUuid(`${table}/${keyValues.join("\u0000")}`);
}

/**
 * The slug of a piece of demo content, normalised the way every seeder in this
 * repo has always done it: lowercase, ASCII, hyphenated.
 * @param {string} name
 */
export function demoSlug(name) {
    return String(name)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

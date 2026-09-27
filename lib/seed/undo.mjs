/**
 * Manifest-driven removal: undo exactly what the seed packs wrote.
 *
 * The teardown mechanism this replaces matched a hardcoded list of demo slugs,
 * and that list had already drifted once (migration 20260902000000 shipped demo
 * polls, 20260926000001 deleted them, and all three lists still carried the old
 * slugs). The manifest records the primary keys actually written, so removal is
 * exact even after an editor renames the slug a list would have matched on, and
 * a row nobody seeded can never be swept by a pattern match.
 *
 * Undo modes come from lib/seed/tables.mjs:
 *   delete — remove the row.
 *   clear  — null the registry's `clear` columns, restoring default behaviour.
 *            Used for human-editable config (site_settings): the row may predate
 *            the seed, and deleting it would destroy an operator's own value.
 *   none   — leave it alone.
 *
 * Order is the whole point of DELETE_ORDER: children before parents, so a
 * content item's translations and extension rows go before the item. The schema's
 * ON DELETE CASCADE would often handle it, but not uniformly — homepage_slots,
 * ad_campaigns and others reference content with SET NULL — and leaning on
 * per-table cascade behaviour is how a cleanup script leaves orphans.
 */

import { tableSpec } from "./tables.mjs";

/**
 * Tables ordered leaf-first for safe deletion: anything referencing another
 * seeded table appears before the table it references. Tables missing from this
 * list sort last, which is safe because they hold no inbound seed references.
 */
export const DELETE_ORDER = [
    "category_translations", "tag_translations", "media_text_variants",
    "content_translations", "daily_brief_items", "content_tags", "submission_media",
    "listing_conversation_messages", "poll_votes", "poll_options",
    "notices", "listings", "events", "fundraisers", "business_categories", "business_media",
    "homepage_slots", "ad_campaigns", "advertisers",
    "saved_articles", "saved_content", "content_reactions", "content_feedback",
    "content_follows", "contributor_follows", "listing_ratings", "price_watches",
    "event_reminders", "user_blocks", "user_admin_roles", "user_roles",
    "policy_acceptances", "notification_prefs", "user_place_preferences",
    "admin_widget_layouts", "submission_escalations", "submission_reviews",
    "moderation_log", "timeline_entries", "photo_pairs",
    "location_slug_redirects", "state_schedules", "system_state_themes",
    "brand_asset_usage", "brand_theme_versions",
    "publish_plans", "content_templates", "emergency_publishing_presets",
    "digest_subscribers", "digest_issues", "daily_briefs",
    "takedown_requests", "corrections", "reports", "data_requests",
    "submissions", "media_assets", "listing_conversations",
    // content_items sits below every table that references it, so a teardown
    // removes a story's translations, media and extension rows before the story
    // itself. It would usually survive on ON DELETE CASCADE alone, but this list
    // exists precisely so removal does not depend on cascade behaviour that
    // differs per relationship here (homepage_slots and polls are SET NULL).
    "content_items",
    "polls",
    "businesses", "brand_assets", "brand_themes", "ad_slots",
    "profiles", "categories", "tags", "locations",
    "notification_outbox", "notifications", "admin_notifications",
    "legacy_redirects", "site_settings",
];

/**
 * Sort table names into deletion order, which is DELETE_ORDER's own written
 * order: earlier in the list means removed earlier, so a table always goes
 * before anything that references it. A table missing from the list sorts first,
 * on the assumption that nothing seeded references it — if that is ever untrue,
 * add the table in the right position rather than relying on the fallback.
 */
export function inDeleteOrder(tables) {
    const rank = new Map(DELETE_ORDER.map((t, i) => [t, i]));
    return [...tables].sort((a, b) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1));
}

/**
 * Build a primary-key predicate for a manifest row.
 *
 * A composite key can legitimately hold a null (content_follows' optional
 * category/location), and in PostgREST `eq null` matches nothing — those need
 * `.is(col, null)`, or the row would silently survive teardown.
 *
 * @param {any} query an in-flight PostgREST query builder
 * @param {string[]} pkColumns
 * @param {Record<string, unknown>} pkValues
 */
function wherePk(query, pkColumns, pkValues) {
    let out = query;
    for (const column of pkColumns) {
        const value = pkValues?.[column];
        if (value === undefined) continue;
        out = value === null ? out.is(column, null) : out.eq(column, value);
    }
    return out;
}

/**
 * Apply one manifest row's undo.
 *
 * A missing table is not an error: teardown has to stay runnable against a
 * database where a migration was never applied, and abandoning the remaining
 * three hundred rows over one absent table is the wrong trade.
 *
 * @param {any} db service-role client
 * @param {{ table: string, pk: Record<string, unknown>, undo: string }} row
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function undoManifestRow(db, row) {
    let spec;
    try {
        spec = tableSpec(row.table);
    } catch (error) {
        return { ok: false, error: error.message };
    }
    if (row.undo === "none") return { ok: true };

    if (row.undo === "clear") {
        const blank = Object.fromEntries((spec.clear ?? []).map((c) => [c, null]));
        if (!Object.keys(blank).length) return { ok: true };
        const { error } = await wherePk(db.from(row.table).update(blank), spec.pk, row.pk);
        return error ? { ok: false, error: error.message } : { ok: true };
    }

    const { error } = await wherePk(db.from(row.table).delete(), spec.pk, row.pk);
    // 42P01 = undefined_table (this project has not applied that migration).
    if (error && error.code !== "42P01") return { ok: false, error: error.message };
    return { ok: true };
}

/**
 * Undo the manifest rows in safe order.
 *
 * Only rows that were successfully undone are dropped from the manifest; a row
 * that errored stays recorded so the next teardown run retries it. Without that,
 * a partial failure would silently lose the proof that anything is still seeded.
 *
 * @param {{
 *   db: any,
 *   manifest: { rows: any[], packs: any[] },
 *   packIds?: string[],
 *   log?: (...a: unknown[]) => void,
 * }} options
 * @returns {Promise<{ undone: number, failed: number, errors: string[], failedKeys: Set<string>, packsComplete: string[] }>}
 */
export async function undoManifest({ db, manifest, packIds, log = () => {} }) {
    const wanted = packIds?.length ? new Set(packIds) : null;
    const targets = manifest.rows.filter((r) => !wanted || wanted.has(r.pack));

    /** @type {Map<string, any[]>} */
    const buckets = new Map();
    for (const row of targets) {
        if (!buckets.has(row.table)) buckets.set(row.table, []);
        buckets.get(row.table).push(row);
    }

    const out = { undone: 0, failed: 0, errors: [], failedKeys: new Set(), packsComplete: [] };
    for (const table of inDeleteOrder(buckets.keys())) {
        for (const row of buckets.get(table)) {
            const result = await undoManifestRow(db, row);
            if (result.ok) {
                out.undone += 1;
                continue;
            }
            out.failed += 1;
            out.failedKeys.add(`${row.table}|${JSON.stringify(row.pk)}`);
            out.errors.push(`${table} ${JSON.stringify(row.pk)}: ${result.error}`);
        }
        const size = buckets.get(table).length;
        const bad = buckets.get(table).filter((r) => out.failedKeys.has(`${table}|${JSON.stringify(r.pk)}`)).length;
        log(`  ${table.padEnd(26)} ${size - bad}/${size} undone`);
    }

    // A pack counts as fully removed only when none of its rows failed.
    const candidatePacks = wanted ? [...wanted] : manifest.packs.map((p) => p.id);
    const failedPacks = new Set(
        targets.filter((r) => out.failedKeys.has(`${r.table}|${JSON.stringify(r.pk)}`)).map((r) => r.pack),
    );
    out.packsComplete = candidatePacks.filter((id) => !failedPacks.has(id));
    return out;
}


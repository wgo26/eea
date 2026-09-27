/**
 * The seed table registry — one entry per table the preset packs may write.
 *
 * Single source of truth for two things the runner cannot guess:
 *
 *   1. `pk`   — the primary-key columns, which PostgREST needs as the
 *               `onConflict` target and which the manifest needs to identify a
 *               row. Many tables here have composite or non-`id` keys
 *               (`analytics_daily`, `backup_jobs`, `site_settings`,
 *               `cron_heartbeats`, `user_roles`, the `*_translations` tables),
 *               so a generic "assume id" would silently corrupt the manifest.
 *   2. `undo` — what teardown does with a row a pack wrote. `delete` removes it;
 *               `clear` nulls the listed columns and restores default behaviour
 *               (human-editable config like `site_settings`, where a seed must
 *               never destroy an operator's own value).
 *
 * Plain `.mjs` on purpose: `package.json` pins the runtime to Node 22, where
 * `node scripts/x.mjs` cannot import a `.ts` file, so the registry has to be
 * loadable by both the scripts and vitest. JSDoc types keep it fully checked —
 * tsconfig has `allowJs: true`, and lib/seed/contract.ts imports these types.
 *
 * Column facts mirror the migrations exactly. When a migration adds a seedable
 * table, add it here in the same PR (lockstep rule, architecture-checklist.md).
 */

/** @typedef {"delete" | "clear"} SeedUndo */

/**
 * @typedef {object} SeedTableSpec
 * @property {readonly string[]} pk Primary-key columns (composite where needed).
 * @property {readonly string[]} [unique] Alternate unique key, used to dedupe
 *   rows whose PK is a database-generated uuid.
 * @property {SeedUndo} undo Teardown behaviour for rows written through here.
 * @property {readonly string[]} [clear] Columns `undo: 'clear'` nulls out.
 * @property {boolean} [requiresPk] PK has no generated default, so a pack must
 *   supply it (e.g. `system_states.id` is a caller-chosen text key like CRITICAL).
 * @property {readonly string[]} [nullable] Key columns that may legitimately be
 *   null. A unique index never matches a null, so rows keyed on them are written
 *   insert-if-absent rather than upserted.
 */

/** @type {Record<string, SeedTableSpec>} */
export const SEED_TABLE_SPECS = {
    // ---- taxonomy -------------------------------------------------------
    locations: { pk: ["id"], unique: ["slug"], undo: "delete" },
    location_slug_redirects: { pk: ["id"], unique: ["old_slug"], undo: "delete" },
    categories: { pk: ["id"], unique: ["content_type", "slug"], undo: "delete" },
    category_translations: { pk: ["category_id", "locale"], undo: "delete" },
    tags: { pk: ["id"], unique: ["slug"], undo: "delete" },
    tag_translations: { pk: ["tag_id", "locale"], undo: "delete" },

    // ---- people ---------------------------------------------------------
    profiles: { pk: ["id"], undo: "delete" },
    user_roles: { pk: ["user_id", "role"], undo: "delete" },
    user_admin_roles: { pk: ["id"], unique: ["user_id", "role"], undo: "delete" },
    notification_prefs: { pk: ["user_id"], undo: "delete" },
    user_place_preferences: { pk: ["user_id"], undo: "delete" },
    user_blocks: { pk: ["id"], undo: "delete" },

    // ---- content --------------------------------------------------------
    content_items: { pk: ["id"], unique: ["slug"], undo: "delete" },
    content_translations: { pk: ["id"], unique: ["content_item_id", "locale", "voice"], undo: "delete" },
    media_assets: { pk: ["id"], undo: "delete" },
    media_text_variants: { pk: ["media_id", "locale", "voice"], undo: "delete" },
    notices: { pk: ["content_item_id"], undo: "delete" },
    listings: { pk: ["content_item_id"], undo: "delete" },
    events: { pk: ["content_item_id"], undo: "delete" },
    fundraisers: { pk: ["content_item_id"], undo: "delete" },
    content_relationships: { pk: ["id"], unique: ["source_content_id", "target_content_id", "relationship_type"], undo: "delete" },
    content_tags: { pk: ["content_item_id", "tag_id"], undo: "delete" },
    // A follow can be section-wide (category/location null), and Postgres treats
    // NULLs as distinct in unique indexes — so this row cannot be matched by
    // ON CONFLICT and is written insert-if-absent. `nullable` names which key
    // columns may legitimately be null, so planRows does not reject them.
    content_follows: { pk: ["user_id", "content_type", "category_id", "location_id"], undo: "delete", nullable: ["category_id", "location_id"] },
    saved_content: { pk: ["user_id", "content_item_id"], undo: "delete" },
    saved_articles: { pk: ["id"], unique: ["user_id", "content_item_id", "locale"], undo: "delete" },
    content_feedback: { pk: ["user_id", "content_item_id"], undo: "delete" },
    content_reactions: { pk: ["id"], unique: ["content_item_id", "kind", "reactor_token"], undo: "delete" },
    timeline_entries: { pk: ["id"], undo: "delete" },
    photo_pairs: { pk: ["id"], undo: "delete" },
    price_watches: { pk: ["user_id", "content_item_id"], undo: "delete" },
    event_reminders: { pk: ["id"], unique: ["user_id", "content_item_id"], undo: "delete" },

    // ---- curation -------------------------------------------------------
    homepage_slots: { pk: ["id"], undo: "delete" },

    // ---- participation / moderation -------------------------------------
    submissions: { pk: ["id"], undo: "delete" },
    submission_media: { pk: ["submission_id", "media_id"], undo: "delete" },
    submission_reviews: { pk: ["id"], undo: "delete" },
    submission_escalations: { pk: ["id"], undo: "delete" },
    moderation_log: { pk: ["id"], undo: "delete" },

    // ---- trust & legal --------------------------------------------------
    reports: { pk: ["id"], undo: "delete" },
    corrections: { pk: ["id"], undo: "delete" },
    takedown_requests: { pk: ["id"], undo: "delete" },
    data_requests: { pk: ["id"], undo: "delete" },
    policy_versions: { pk: ["id"], unique: ["policy_type", "locale", "version"], undo: "delete" },
    policy_acceptances: { pk: ["id"], unique: ["user_id", "policy_version_id"], undo: "delete" },
    about_sections: { pk: ["id"], unique: ["section_key", "locale"], undo: "delete" },
    advertise_sections: { pk: ["id"], unique: ["section_key", "locale"], undo: "delete" },
    // Human-editable config: seeding writes a value, teardown clears it back to
    // NULL (the public site then renders its dictionary default) — never deletes.
    site_settings: { pk: ["key"], undo: "clear", clear: ["value"] },

    // ---- polls -----------------------------------------------------------
    polls: { pk: ["id"], unique: ["slug"], undo: "delete" },
    poll_options: { pk: ["id"], undo: "delete" },
    poll_votes: { pk: ["id"], unique: ["poll_id", "voter_token"], undo: "delete" },

    // ---- marketplace / directory ----------------------------------------
    businesses: { pk: ["id"], unique: ["slug"], undo: "delete" },
    business_categories: { pk: ["business_id", "category_id"], undo: "delete" },
    business_media: { pk: ["business_id", "media_id"], undo: "delete" },
    listing_conversations: { pk: ["id"], unique: ["content_item_id", "buyer_id", "seller_id"], undo: "delete" },
    listing_conversation_messages: { pk: ["id"], undo: "delete" },
    listing_ratings: { pk: ["user_id", "content_item_id"], undo: "delete" },
    contributor_follows: { pk: ["follower_id", "contributor_id"], undo: "delete" },

    // ---- advertising -----------------------------------------------------
    advertisers: { pk: ["id"], undo: "delete" },
    ad_slots: { pk: ["id"], unique: ["slot_key"], undo: "delete" },
    ad_campaigns: { pk: ["id"], undo: "delete" },
    // ad_events / ad_inquiry_events are NOT here: they are impression and
    // pipeline ledgers ("someone saw this ad", "this inquiry moved stage").
    // ad_campaigns.impressions is derived from ad_events and feeds the
    // advertiser performance report, so a seeded event is a paid-ad metric lie.
    // /admin/ads and the event beacon route exercise them for real.

    // ---- digest / briefs --------------------------------------------------
    digest_subscribers: { pk: ["id"], undo: "delete" },
    digest_issues: { pk: ["id"], unique: ["sent_on", "locale", "cadence"], undo: "delete" },
    daily_briefs: { pk: ["id"], undo: "delete" },
    daily_brief_items: { pk: ["brief_id", "content_item_id"], undo: "delete" },
    // digest_slots is NOT here: rows are created by the digest_slot_on_publish
    // trigger and their sent_at/removed columns are delivery state that the 06:00
    // freeze owns. Seeding slots would fake an accumulation the reader then gets
    // mailed. The content packs produce them for real by publishing.
    //
    // translation_jobs / translation_memory are NOT here either: a job asserts
    // "a human is translating this" and memory asserts "this rendering was
    // approved". Both belong to /admin/translations, where staff create them.

    // ---- automation -------------------------------------------------------
    content_templates: { pk: ["id"], unique: ["slug_base"], undo: "delete" },
    publish_plans: { pk: ["id"], undo: "delete" },
    emergency_publishing_presets: { pk: ["id"], unique: ["name"], undo: "delete" },

    // ---- notifications ----------------------------------------------------
    // Seeded ONLY by audience: "local" packs, following the precedent of
    // scripts/seed-notify.mjs (which marks every row it writes
    // data->>demo = "seed-notify" so it is recognisable and removable). The
    // purpose is exercising the delivery loop and the /admin/notifications
    // actions without waiting for real intake — not populating an alert queue.
    // The production guard in scripts/seed.mjs refuses these packs, so a hosted
    // project can never end up with a fabricated staff alert.
    notification_outbox: { pk: ["id"], undo: "delete" },
    notifications: { pk: ["id"], undo: "delete" },
    admin_notifications: { pk: ["id"], undo: "delete" },
    // The producer registry is vocabulary, not a ledger, but migrations
    // 20261031000000 + 20261108000000 already install all five sources; no pack
    // needs to write it and adding a source is meant to be a reviewable act.
    admin_notification_sources: { pk: ["key"], undo: "delete", requiresPk: true },

    // ---- branding & contextual states ------------------------------------
    brand_themes: { pk: ["id"], unique: ["name", "version"], undo: "delete" },
    brand_theme_versions: { pk: ["id"], unique: ["theme_id", "version"], undo: "delete" },
    brand_assets: { pk: ["id"], undo: "delete" },
    brand_asset_usage: { pk: ["id"], unique: ["asset_id", "theme_id", "role"], undo: "delete" },
    // `id` is a caller-chosen text key (NORMAL, CRITICAL, HOLIDAY...), not a uuid.
    system_states: { pk: ["id"], undo: "delete", requiresPk: true },
    state_schedules: { pk: ["id"], unique: ["state_id", "start_month", "start_day", "end_month", "end_day"], undo: "delete" },
    system_state_themes: { pk: ["state_id"], undo: "delete", requiresPk: true },
    admin_widget_layouts: { pk: ["id"], unique: ["user_id"], undo: "delete" },

    // ---- legacy / SEO ------------------------------------------------------
    legacy_redirects: { pk: ["from_path"], undo: "delete", requiresPk: true },

    // ---- NOT SEEDABLE ON PURPOSE (the no-ledgers rule) ---------------------
    // cron_heartbeats, app_flags, analytics_daily, llm_calls, audit_events,
    // audit_archives, rate_limit_hits, backup_jobs, storage_tasks, db_dumps,
    // api_credentials, credential_events, system_state_events, incidents,
    // incident_events.
    // Each is a record that something already happened (a job ran, a state was
    // activated, a viewer loaded a page, a token was spent, an outage occurred)
    // or a security/operational claim about this deployment. A row written by a
    // seed script would be a lie the admin UI reports as fact, so these tables
    // are absent from this registry and every pack is checked against it.
    // See the header of presets/index.mjs and docs/seeding.md.
};

/** Every table a pack is allowed to write. @returns {string[]} */
export function seedTableNames() {
    return Object.keys(SEED_TABLE_SPECS);
}

/**
 * Look up a table's spec, failing loudly so a typo in a pack is a load-time
 * error rather than a confusing PostgREST rejection mid-run.
 * @param {string} table
 * @returns {SeedTableSpec}
 */
export function tableSpec(table) {
    const spec = SEED_TABLE_SPECS[table];
    if (!spec) {
        throw new Error(`unknown seed table "${table}" — add it to lib/seed/tables.mjs first`);
    }
    return spec;
}

/** PostgREST `onConflict` target: the PK columns, comma-separated. */
export function pkConflictTarget(table) {
    return tableSpec(table).pk.join(",");
}

/**
 * The key a pack dedupes on. For tables with a natural unique key (slug,
 * slot_key, key, …) that key — it is what identifies "the same" seeded row
 * across runs and across a legacy hand-created row. Otherwise the PK.
 * @param {string} table
 * @returns {readonly string[]}
 */
export function dedupeKey(table) {
    const spec = tableSpec(table);
    return spec.unique ?? spec.pk;
}

/**
 * True when an upsert targeting `columns` is unsafe because one of them is null.
 * Postgres treats NULLs as distinct in unique indexes, so `ON CONFLICT` never
 * matches such a row and repeated runs would pile up duplicates. The runner
 * falls back to select-then-insert for those.
 * @param {readonly string[]} columns
 * @param {Record<string, unknown>} row
 */
export function conflictTargetIsNullable(columns, row) {
    return columns.some((column) => row[column] === null || row[column] === undefined);
}



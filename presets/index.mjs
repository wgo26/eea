/**
 * The preset catalogue: every seed pack the platform ships, and the single place
 * the runner and the tests load them from.
 *
 * Adding a pack is two steps: write it under its family directory, then add one
 * line here. Nothing else needs to know it exists — ids are how profiles, the
 * manifest and teardown refer to packs, and lib/seed/seed.test.ts fails the
 * suite if a pack is declared here but missing on disk (or vice versa).
 *
 * WHAT THIS CATALOGUE DELIBERATELY DOES NOT SEED — the no-ledgers rule
 * (enforced by absence from lib/seed/tables.mjs; see docs/seeding.md):
 *
 *   cron_heartbeats    a row claims a job ran. /api/ready reports staleness from
 *                      it, so a seeded heartbeat is an uptime lie.
 *   llm_calls          usage history that never happened; it feeds the daily
 *                      budget cap in lib/admin/actions/ai.ts, so fake rows would
 *                      spend a real budget.
 *   audit_events       the tamper-evident hash chain (20261111000000) only means
 *                      something if every row is genuine.
 *   analytics_daily    a privacy contract about real traffic; synthesising it
 *                      would break the contract, not just the chart.
 *   app_flags          a verdict the automation has not reached. The one key
 *                      (digest.pitch_winner) defaults sanely when absent, and
 *                      writing it would make the next ops-sweep log a promotion
 *                      that never happened.
 *   backup_jobs/db_dumps/storage_tasks  job state and lease columns; the crons
 *                      own them and a seeded lease can block a real run.
 *
 * An empty table that means "this has not happened yet" is the correct state, and
 * the admin UIs already render it honestly. Seeding it would manufacture exactly
 * the false positives this platform's policy is built to avoid.
 */

import cfgSiteSettings from "./config/cfg-site-settings.mjs";
import taxLocations from "./taxonomy/tax-locations.mjs";
import taxCategories from "./taxonomy/tax-categories.mjs";
import taxTags from "./taxonomy/tax-tags.mjs";
import tplRecapGallery from "./automation/tpl-recap-gallery.mjs";

import pplDemo from "./people/people-demo.mjs";
import edDemoContent from "./editorial/ed-demo-content.mjs";
import mpDemoBusinesses from "./marketplace/mp-demo-businesses.mjs";
import notifyDemoOutbox from "./notify/notify-demo-outbox.mjs";
import engagementDemo from "./engagement/engagement-demo.mjs";
import brandStateDemo from "./brand-state/brand-state-demo.mjs";
import adsDemo from "./ads/ads-demo.mjs";
import participationDemo from "./participation/participation-demo.mjs";
import trustDemo from "./trust/trust-demo.mjs";
import adminUxDemo from "./admin-ux/admin-ux-demo.mjs";
import volumeDemo from "./volume/volume-demo.mjs";

/** @type {import("../lib/seed/contract.mjs").SeedPack[]} */
export const PACKS = [
    cfgSiteSettings,
    taxLocations,
    taxCategories,
    taxTags,
    tplRecapGallery,
    pplDemo,
    edDemoContent,
    mpDemoBusinesses,
    notifyDemoOutbox,
    engagementDemo,
    brandStateDemo,
    adsDemo,
    participationDemo,
    trustDemo,
    adminUxDemo,
    volumeDemo,
];


/** Every distinct family in the catalogue, sorted — what `--list` groups by. */
export const FAMILIES = [...new Set(PACKS.map((p) => p.family))].sort();

/**
 * Packs by id, for --packs=x,y selection and dep lookup.
 * @type {Map<string, import("../lib/seed/contract.mjs").SeedPack>}
 */
export const PACKS_BY_ID = new Map(PACKS.map((p) => [p.id, p]));

/**
 * Resolve a comma-separated --packs value into an ordered pack list, pulling in
 * each named pack's dependencies automatically (asking for `plan-daily` without
 * its `tpl-*` dependency would otherwise write a plan pointing at no template).
 * @param {string} csv
 */
export function selectPackIds(csv) {
    const requested = csv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const missing = requested.filter((id) => !PACKS_BY_ID.has(id));
    if (missing.length) {
        throw new Error(
            `unknown pack(s): ${missing.join(", ")}\n  try: node scripts/seed.mjs --list`,
        );
    }
    const picked = new Map();
    const add = (id) => {
        if (picked.has(id)) return;
        const pack = PACKS_BY_ID.get(id);
        if (!pack) throw new Error(`unknown pack "${id}"`);
        for (const dep of pack.deps ?? []) add(dep);
        picked.set(id, pack);
    };
    for (const id of requested) add(id);
    return picked;
}

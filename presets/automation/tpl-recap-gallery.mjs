/**
 * Pack: tpl-recap-gallery — the advanced recap-template library.
 *
 * `content_templates` rows are recipes the crons compile into DRAFTS:
 * lib/content/templates-run.ts pulls the window's published items (section,
 * optional exact type, optional location/tag filter) and renders one StoryBlock
 * per source item under a generated intro. Migration 20261106000000 ships five
 * weekly recaps — one per section. This extends the gallery across every axis the
 * engine actually supports, so /admin/templates demonstrates what is possible
 * rather than only what was first written:
 *
 *   cadence         daily recaps compile inside the 06:00 ops-digest run, weekly
 *                   inside the Monday weekly-digest run.
 *   source_filters  location_slug / tag_slug — the only two keys toConfig reads,
 *                   resolved by SLUG at compile time, so the values must exist in
 *                   locations/tags. Hence `deps`: this pack runs after both.
 *   state_id        (20261109000000) a template tagged with a system state
 *                   compiles only while that state is the highest-priority active
 *                   one, so a seasonal recap appears and disappears with it.
 *   living          true keeps ONE managed draft and appends only items absent
 *                   from content_items.template_ledger — an editor deleting a
 *                   block is a permanent decision. false creates a fresh dated
 *                   draft each run. Both are seeded so the difference is visible.
 *
 * SEED-IF-ABSENT. The five migration-shipped templates are ordinary config that
 * staff may have renamed or re-windowed, so any slug_base that already exists is
 * skipped rather than reset.
 *
 * Nothing here publishes. Every compile waits in the drafts queue for a human
 * ("suggest, never assert"); auto-publish is a separate two-person-controlled act
 * owned by publish_plans (see plan-release-schedule.mjs).
 */

/**
 * [slug_base, name, nameFr, section, sourceType, locationSlug, tagSlug,
 *  windowDays, cadence, living, stateId]
 * @type {Array<[string, string, string, string, string|null, string|null, string|null, number, string, boolean, string|null]>}
 */
const TEMPLATES = [
    // --- the shipped five: skipped when present, listed so a fresh database
    //     (or a local reset) gets a working gallery without hand-config.
    ["this-week-in-pictures", "This week in pictures", "La semaine en images", "photo", "photo_story", null, null, 7, "weekly", true, null],
    ["community-recap", "Community stories recap", "Rappel des histoires", "news", "news", null, null, 7, "weekly", true, null],
    ["board-weekly", "This week on the board", "La semaine sur le tableau", "notice", "notice", null, null, 7, "weekly", true, null],
    ["marketplace-weekly", "Marketplace highlights", "Annonces de la semaine", "listing", "listing", null, null, 7, "weekly", true, null],
    ["culture-this-week", "Culture this week", "La culture de la semaine", "culture", "culture", null, null, 7, "weekly", true, null],

    // --- daily: what happened since yesterday, compiled at 06:00
    ["daily-brief-news", "Yesterday in the news", "L'actualité d'hier", "news", null, null, null, 1, "daily", true, null],
    ["daily-brief-notices", "Today on the board", "Le tableau du jour", "notice", null, null, null, 1, "daily", true, null],
    ["daily-new-listings", "New on the marketplace", "Nouveau sur le marché", "listing", null, null, null, 1, "daily", false, null],
    ["daily-culture-picks", "Today's culture pick", "Choix culturel du jour", "culture", null, null, null, 1, "daily", false, null],

    // --- place-scoped: the community record, per place
    ["week-in-bamenda", "This week in Bamenda", "La semaine à Bamenda", "news", null, "bamenda", null, 7, "weekly", true, null],
    ["week-in-douala", "This week in Douala", "La semaine à Douala", "news", null, "douala", null, 7, "weekly", true, null],
    ["week-in-yaounde", "This week in Yaoundé", "La semaine à Yaoundé", "news", null, "yaounde", null, 7, "weekly", true, null],
    ["week-in-buea", "This week in Buea", "La semaine à Buéa", "news", null, "buea", null, 7, "weekly", true, null],
    ["pictures-of-bamenda", "Bamenda in pictures", "Bamenda en images", "photo", null, "bamenda", null, 14, "weekly", true, null],
    ["board-in-bafut", "Bafut community board", "Tableau de Bafut", "notice", null, "bafut", null, 7, "weekly", true, null],

    // --- topic recaps, narrowed by tag_slug
    ["week-in-music", "The week in music", "La semaine musicale", "culture", null, null, "music", 7, "weekly", true, null],
    ["week-in-food", "Food this week", "Cuisine de la semaine", "culture", null, null, "food", 7, "weekly", true, null],
    ["roads-water-power", "Roads, water and power", "Routes, eau et électricité", "news", null, null, "road-safety", 14, "weekly", true, null],
    ["market-prices", "Market prices round-up", "Récapitulatif des prix", "news", null, null, "market-prices", 7, "weekly", true, null],
    ["schools-this-term", "Schools this term", "Écoles ce trimestre", "news", null, null, "schools", 30, "weekly", true, null],
    ["street-voices", "Eye on the Street", "Regard de la rue", "news", null, null, "eye-on-the-street", 7, "weekly", true, null],
    ["then-and-now-week", "Then & Now this week", "Hier & aujourd'hui", "photo", null, null, "then-and-now", 14, "weekly", true, null],
    ["civic-accountability", "Civic accountability watch", "Suivi de redevabilité", "news", null, null, "accountability", 14, "weekly", true, null],

    // --- state-scoped: compile only while their season is the active state
    ["holiday-round-up", "The holiday season in review", "Le bilan des fêtes", "news", null, null, null, 14, "weekly", false, "HOLIDAY"],
    ["holiday-marketplace", "Holiday marketplace highlights", "Annonces des fêtes", "listing", null, null, null, 14, "weekly", false, "HOLIDAY"],
    ["back-to-school-recap", "Back to school roundup", "Bilan de la rentrée", "notice", null, null, null, 30, "weekly", false, "BACK_TO_SCHOOL"],
    ["back-to-school-prices", "Uniforms, books and fees", "Uniformes, livres et frais", "listing", null, null, null, 30, "weekly", false, "BACK_TO_SCHOOL"],
    ["election-watch", "Election period recap", "Bilan de la période électorale", "news", null, null, null, 7, "daily", false, "ELECTION_PERIOD"],

    // --- one-shot long windows: every compile is a fresh dated draft
    ["month-in-review", "Month in review", "Le mois en revue", "news", null, null, null, 30, "weekly", false, null],
    ["photo-story-month", "Photo story of the month", "Histoire photo du mois", "photo", null, null, null, 30, "weekly", false, null],
    ["quarter-community", "Community quarter", "Le trimestre communautaire", "news", null, null, null, 90, "weekly", false, null],
];

export default {
    id: "tpl-recap-gallery",
    family: "automation",
    tier: 7,
    audience: "prod-safe",
    deps: ["tax-locations", "tax-tags"],
    title: "Recap template gallery",
    titleFr: "Galerie de modèles de récapitulatif",
    what: "The content_templates library: per-section, daily, place-scoped, tag-scoped and state-scoped recaps, in living and one-shot modes.",
    tables: ["content_templates"],
    async rows(ctx) {
        // Seed-if-absent. Templates are ordinary configuration that staff tune —
        // a demo re-run must never revert someone's edited window or name. The
        // five migration-shipped recipes are therefore skipped when present.
        await ctx.load("content_templates", { withRows: true });
        const out = [];
        for (const [
            slugBase, name, nameFr, section, sourceType,
            locationSlug, tagSlug, windowDays, cadence, living, stateId,
        ] of TEMPLATES) {
            if (ctx.current("content_templates", slugBase)) continue;
            out.push({
                table: "content_templates",
                row: {
                    name,
                    name_fr: nameFr,
                    slug_base: slugBase,
                    section,
                    source_type: sourceType,
                    // The only two keys toConfig() reads; an unknown slug compiles
                    // to an empty window rather than failing the job.
                    source_filters: {
                        ...(locationSlug ? { location_slug: locationSlug } : {}),
                        ...(tagSlug ? { tag_slug: tagSlug } : {}),
                    },
                    window_days: windowDays,
                    cadence,
                    living,
                    is_active: true,
                    state_id: stateId,
                },
                note: `${section}/${cadence}${locationSlug ? `@${locationSlug}` : ""}${tagSlug ? `#${tagSlug}` : ""}${stateId ? ` [${stateId}]` : ""}`,
            });
        }
        return out;
    },
};

/**
 * Pack: engagement-demo — reactions, poll results, and view counts.
 *
 * Seeds the interaction signals that power the engagement UI: reaction tallies
 * (via content_reactions rows with anonymous reactor tokens), poll vote tallies
 * (via poll_votes rows with anonymous voter tokens), and view counts on
 * content_items. This gives the public-facing engagement widgets (reaction
 * bars, poll result bars, view counts) real data to render so the demo site
 * looks lived-in rather than empty.
 *
 * Schema reality (not assumptions):
 *   - content_reactions: only 'like' and 'helpful' kinds; reactor_token must
 *     match ^[A-Za-z0-9-]{8,64}$; unique (content_item_id, kind, reactor_token).
 *   - poll_votes: voter_token required; unique (poll_id, voter_token).
 *   - poll_options: matched by deriving the option id via the same seed pattern
 *     as ed-demo-content (poll/{slug}/opt/{index}) — no need to read the rows.
 *   - content_items.view_count is a column (no separate content_views table).
 *   The content_reaction_counts and poll_results objects are VIEWS, so we
 *   seed raw rows and let the aggregates fall out.
 *
 * Polls are created in ed-demo-content: mankon-market-priority,
 * rainy-season-readiness, what-to-cover-next.
 *
 * Audience: staging.
 */

/** Reactions: only 'like' and 'helpful' per content_reactions schema. */
const REACTIONS = [
    { contentSlug: "farmers-market-prices", like: 42, helpful: 18 },
    { contentSlug: "commercial-avenue-reopens", like: 118, helpful: 31 },
    { contentSlug: "motorcycle-taxi-nights-bamenda", like: 64, helpful: 25 },
    { contentSlug: "sunday-choir-bafut", like: 89, helpful: 44 },
    { contentSlug: "ngoma-festival-lineup", like: 33, helpful: 19 },
    { contentSlug: "city-council-water-points", like: 21, helpful: 15 },
    { contentSlug: "new-nkwen-footbridge", like: 156, helpful: 72 },
    { contentSlug: "dawn-at-mankon-market", like: 28, helpful: 11 },
];

/**
 * Poll votes as counts, keyed by poll slug and option index (matching the
 * seed pattern in ed-demo-content: poll/{slug}/opt/{index}).
 */
const POLL_VOTES = [
    { pollSlug: "mankon-market-priority", optIndex: 0, votes: 120, label: "Clear the main culvert under Commercial Avenue" },
    { pollSlug: "mankon-market-priority", optIndex: 1, votes: 85, label: "Rebuild the channel along the lower stalls" },
    { pollSlug: "mankon-market-priority", optIndex: 2, votes: 43, label: "Install proper storm drains at the market entrance" },
    { pollSlug: "mankon-market-priority", optIndex: 3, votes: 12, label: "None of the above" },
    { pollSlug: "rainy-season-readiness", optIndex: 0, votes: 56, label: "Yes, my property is protected" },
    { pollSlug: "rainy-season-readiness", optIndex: 1, votes: 34, label: "Partially — sandbags are ready but not full coverage" },
    { pollSlug: "rainy-season-readiness", optIndex: 2, votes: 23, label: "No, I am not prepared" },
    { pollSlug: "rainy-season-readiness", optIndex: 3, votes: 19, label: "I have no property at flood risk" },
    { pollSlug: "what-to-cover-next", optIndex: 0, votes: 98, label: "The new school feeding programme rollout" },
    { pollSlug: "what-to-cover-next", optIndex: 1, votes: 142, label: "Bamenda-Douala highway construction progress" },
    { pollSlug: "what-to-cover-next", optIndex: 2, votes: 67, label: "Impact of mobile money on local markets" },
    { pollSlug: "what-to-cover-next", optIndex: 3, votes: 51, label: "Climate adaptation in the Grassfields" },
];

const VIEW_COUNTS = [
    { contentSlug: "farmers-market-prices", views: 980 },
    { contentSlug: "new-nkwen-footbridge", views: 1540 },
    { contentSlug: "sunday-choir-bafut", views: 2340 },
    { contentSlug: "motorcycle-taxi-nights-bamenda", views: 720 },
    { contentSlug: "ngoma-festival-lineup", views: 310 },
    { contentSlug: "city-council-water-points", views: 180 },
    { contentSlug: "commercial-avenue-reopens", views: 650 },
    { contentSlug: "dawn-at-mankon-market", views: 420 },
];

export default {
    id: "engagement-demo",
    family: "engagement",
    tier: 5,
    audience: "staging",
    title: "Engagement signals",
    titleFr: "Signaux d'engagement",
    what: "Reaction tallies (content_reactions rows with anonymous tokens), poll vote tallies (poll_votes rows), and view counts (direct updates to content_items.view_count) seeded against the content from ed-demo-content. Reactions are limited to 'like' and 'helpful' per the schema; poll option ids are derived from the same seed pattern as ed-demo-content.",
    tables: ["content_reactions", "poll_votes", "content_items"],
    deps: ["ed-demo-content"],
    async rows(ctx) {
        await ctx.load("content_items");
        await ctx.load("polls");

        const contentSlugToId = (slug) => ctx.id("content_items", slug);

        const out = [];

        // --- reactions (content_reactions rows, one per voter per kind) ---
        for (const r of REACTIONS) {
            const contentId = contentSlugToId(r.contentSlug);
            for (const [kind, count] of Object.entries(r)) {
                if (kind === "contentSlug") continue;
                for (let i = 0; i < count; i++) {
                    out.push({
                        table: "content_reactions", row: {
                            content_item_id: contentId,
                            kind: kind,
                            reactor_token: ctx.token(`reaction/${r.contentSlug}/${kind}/${i}`, 24),
                            created_at: ctx.iso(-1),
                        },
                        note: `reaction ${kind} #${i} on ${r.contentSlug}`,
                    });
                }
            }
        }

        // --- poll votes (poll_votes rows, one per vote) ---
        for (const pv of POLL_VOTES) {
            const pollId = ctx.id("polls", pv.pollSlug);
            const optId = ctx.uuid(`poll/${pv.pollSlug}/opt/${pv.optIndex}`);
            for (let i = 0; i < pv.votes; i++) {
                out.push({
                    table: "poll_votes", row: {
                        id: ctx.uuid(`pollvote/${pv.pollSlug}/${pv.optIndex}/${i}`),
                        poll_id: pollId,
                        option_id: optId,
                        voter_token: ctx.token(`pollvote/${pv.pollSlug}/${pv.optIndex}/${i}`, 24),
                        created_at: ctx.iso(-1),
                    },
                    note: `poll vote on ${pv.pollSlug} option "${pv.label}"`,
                });
            }
        }

        // --- view counts (direct update on content_items view_count column) ---
        for (const v of VIEW_COUNTS) {
            const contentId = contentSlugToId(v.contentSlug);
            out.push({
                table: "content_items", row: {
                    id: contentId,
                    slug: v.contentSlug,
                    view_count: v.views,
                },
                note: `view count ${v.views} on ${v.contentSlug}`,
            });
        }

        return out;
    },
};

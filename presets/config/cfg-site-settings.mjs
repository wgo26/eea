/**
 * Pack: cfg-site-settings — the public, non-secret key/value config.
 *
 * These are the exact keys lib/admin/queries/settings.ts declares in
 * SITE_SETTING_KEYS; a key outside that list is invisible to the admin editor, so
 * the list below is the contract and is checked against it by
 * lib/seed/seed.test.ts (which imports the same constant).
 *
 * TWO RULES
 *
 *  1. Never overwrite an operator. Every value is applied only where the row is
 *     unset (ctx.current → undefined/null/blank), so seeding a live project does
 *     not quietly reset the footer links or the announcement banner.
 *  2. No invented brand facts. Social URLs and the logo are real brand data the
 *     operator owns, so they are seeded as placeholders ONLY on a local project
 *     (`--env=local` / the default when the URL is 127.0.0.1). Against staging or
 *     production this pack writes just the feature switches and the bilingual
 *     name/tagline, which are safe defaults that match lib/constants.
 *
 * Teardown `clear`s these keys rather than deleting the rows (registry
 * `undo: "clear"`), because the row itself may predate the seed.
 */

const FEATURES = [
    ["feature_reading_mode", "true", "Reading mode toggle (low-data full-text view)"],
    ["feature_event_reminders", "true", "Remind-me on culture events (drives /api/cron/reminders)"],
    ["feature_text_to_speech", "true", "Listen-to-this-story control"],
];

const IDENTITY = [
    ["site_name", "Eagle Eye Africa"],
    ["site_tagline", "The community record of what is happening around you"],
    ["site_name_fr", "Eagle Eye Africa"],
    ["site_tagline_fr", "Le carnet communautaire de ce qui se passe autour de vous"],
];

export default {
    id: "cfg-site-settings",
    family: "config",
    tier: 0,
    audience: "prod-safe",
    title: "Site settings",
    titleFr: "Paramètres du site",
    what: "The feature switches and bilingual site identity, plus (local only) the placeholder social links and announcement window an empty database has no way to guess.",
    tables: ["site_settings"],
    async rows(ctx) {
        await ctx.load("site_settings", { withRows: true });
        const wanted = [...FEATURES.map(([key, value, why]) => ({ key, value, why }))];
        for (const [key, value] of IDENTITY) {
            wanted.push({ key, value, why: "bilingual identity" });
        }

        // Placeholder brand data: local only. On a hosted project the operator
        // sets these, and a fake facebook.com/eagleeyeafrica in production would
        // ship a broken link in the footer of a real site.
        if (ctx.env === "local") {
            wanted.push(
                { key: "social_facebook_url", value: "https://facebook.com/eagleeyeafrica", why: "local placeholder" },
                { key: "social_youtube_url", value: "https://youtube.com/@eagleeyeafrica", why: "local placeholder" },
                { key: "site_logo_url", value: "/brand/eagle-eye-mark.svg", why: "local placeholder" },
                // Public contact channels (operator-owned; shown in the guide
                // only when set). Local placeholders so the guide's contact
                // rows render in dev; production stays empty until the
                // operator fills them at Admin → Site content.
                { key: "contact_email", value: "info@eagleeyeafrica.org", why: "local placeholder" },
                { key: "contact_whatsapp", value: "+237 670 040 473", why: "local placeholder" },
                {
                    key: "announcement_text_en",
                    value: "Demo announcement — edit or clear this in Admin → Site content",
                    why: "shows the announcement bar renders",
                },
                {
                    key: "announcement_text_fr",
                    value: "Annonce démo — modifiez ou effacez ceci dans Admin → Contenu du site",
                    why: "FR twin of the demo announcement",
                },
                { key: "announcement_starts_at", value: ctx.iso(-1), why: "window opens yesterday" },
                { key: "announcement_ends_at", value: ctx.iso(6), why: "closes in six days" },
                // Locale-specific links win over the legacy single key (see
                // getSiteSettings in lib/admin/queries/settings.ts), so both are
                // set and `announcement_url` is deliberately left unset rather
                // than duplicated into a value nothing reads first.
                { key: "announcement_url_en", value: "/photo-stories/dawn-at-mankon-market", why: "demo announcement target" },
                { key: "announcement_url_fr", value: "/photo-stories/dawn-at-mankon-market", why: "FR announcement target" },
            );
        }

        const out = [];
        for (const item of wanted) {
            const existing = ctx.current("site_settings", item.key);
            const alreadySet = existing?.value != null && String(existing.value).trim() !== "";
            // An operator's value always wins — that is the entire point of the
            // read-before-write. Every key here is seeded only when unset.
            if (alreadySet) continue;
            out.push({
                table: "site_settings",
                row: { key: item.key, value: item.value, updated_at: ctx.now.toISOString() },
                note: item.why,
            });
        }
        return out;
    },
};

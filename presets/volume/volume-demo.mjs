/**
 * Pack: volume-demo — the Eagle Eye Daily Brief (daily briefs) + digest queue.
 *
 * Seeds the daily-brief pipeline: a published recap brief, a few draft
 * briefs ready for manual review, and two digest_subscribers rows demonstrating
 * the `standard` and `diaspora` pitch_variant split from the pitch-variant
 * migration. This gives the newsletter publishing flow in /admin/newsletter
 * something to show on first load.
 *
 * Audience: staging.
 */

const BRIEFS = [
    {
        publishDate: "2026-09-20",
        locale: "en",
        subject: "Eagle Eye Daily Brief — Saturday, September 20",
        introEn: "Five stories you need to know from the Northwest and Littoral regions.",
        bodyEn: [
            "• A new footbridge opened in Nkwen, replacing the structure washed away in the 2022 floods.",
            "• Mankon market traders are voting on which drainage job to prioritise next.",
            "• The city council announced four new water refill points on Commercial Avenue.",
            "• Road work on Mankon Street will close one lane daily from 7 AM to 5 PM.",
            "• A 2008 Toyota Corolla is listed for sale in Douala.",
        ].join("\n"),
        status: "published",
        publishedAt: "2026-09-20T06:00:00Z",
    },
    {
        publishDate: "2026-09-25",
        locale: "en",
        subject: "Eagle Eye Daily Brief — Thursday, September 25",
        introEn: "Your mid-week roundup from across the regions.",
        bodyEn: [
            "• The rainy-season-readiness poll shows 56% of respondents are prepared for flooding.",
            "• Motorcyclists in BAMEDA report increased thefts after dark.",
            "• City Council approved the new bilingual school feeding programme rollout.",
        ].join("\n"),
        status: "draft",
        publishedAt: null,
    },
    {
        publishDate: "2026-09-24",
        locale: "fr",
        subject: "Bulletin quotidien Eagle Eye — Mardi 24 septembre",
        introEn: "Résumé de la semaine dans les régions du Nord-Ouest et du Littoral.",
        bodyEn: [
            "• Le marché de Mankon vote pour les aménagements des égouts.",
            "• Un nouveau points d'eau potable sur l'avenue Commerciale.",
            "• Les travaux sur la rue Mankon bouclent un travail de réparation.",
        ].join("\n"),
        status: "draft",
        publishedAt: null,
    },
];

const DIGEST_SUBSCRIBERS = [
    { email: "standard@example.com", voice: "formal", pitch: "standard" },
    { email: "diaspora@example.com", voice: "informal", pitch: "diaspora" },
    { email: "editor@example.com", voice: "formal", pitch: "standard" },
    { email: "community@example.com", voice: "informal", pitch: "standard" },
];

export default {
    id: "volume-demo",
    family: "volume",
    tier: 0,
    audience: "staging",
    title: "Daily brief & digest demo data",
    titleFr: "Données de démonstration du bulletin quotidien et du digiciel",
    what: "A published daily-brief recap, two draft briefs, and four digest_subscribers (split across standard and diaspora pitch_variant) so /admin/newsletter demonstrates the publishing and subscription pipelines.",
    tables: ["daily_briefs", "digest_subscribers"],
    deps: [],
    async rows(ctx) {
        await ctx.load("daily_briefs");
        await ctx.load("digest_subscribers");
        const out = [];

        for (const b of BRIEFS) {
            out.push({
                table: "daily_briefs", row: {
                    id: ctx.uuid(`brief/${b.publishDate}/${b.locale}`),
                    publish_date: b.publishDate,
                    locale: b.locale,
                    voice: b.locale === "fr" ? "formal" : "formal",
                    subject: b.subject,
                    intro: b.introEn,
                    body: b.bodyEn,
                    status: b.status,
                    published_at: b.publishedAt,
                    created_at: b.publishedAt || ctx.now.toISOString(),
                },
                note: `daily brief ${b.publishDate} ${b.locale} (${b.status})`,
            });
        }

        for (const s of DIGEST_SUBSCRIBERS) {
            out.push({
                table: "digest_subscribers", row: {
                    id: ctx.uuid(`digest/${s.email}`),
                    email: s.email,
                    voice: s.voice,
                    diaspora_mode: s.pitch === "diaspora",
                    pitch_variant: s.pitch,
                    is_active: true,
                    confirmed_at: ctx.iso(-10),
                    created_at: ctx.iso(-10),
                },
                note: `digest subscriber ${s.email} (${s.pitch})`,
            });
        }

        return out;
    },
};

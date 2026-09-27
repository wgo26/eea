/**
 * Pack: notify-demo-outbox — demo notification outbox rows exercising every
 * staff-facing event type.
 *
 * This is the advanced preset library for the notification layer: it seeds a
 * pending outbox row for each of the 22 event types defined in
 * lib/notify/events.ts, so /admin/notifications can demonstrate every render
 * path, every deep-link, and every retry/copy/wa.me action without waiting
 * for real intake.
 *
 * Every row is tagged data.demo = "seed-notify" so it is recognisable and
 * removable — the same convention scripts/seed-notify.mjs used. The pack is
 * audience: "local" because the production guard in scripts/seed.mjs refuses
 * it: a live deployment must never have a fabricated staff alert.
 *
 * It also seeds:
 *   - digest_subscribers: one inactive example.com sink + one inactive with
 *     a real-ish email, so the subscribers table and pitch-variant toggle render.
 *   - notification_prefs for the demo contributor profile, exercising the
 *     quiet-hours + WhatsApp toggles in /account/notifications.
 *
 * deps: people-demo for the profile FK on prefs.
 */

/** One demo row per event type. Each entry is tuned to render a realistic title/body. */
const DEMO_OUTBOX = [
    {
        event: "submission.received", audience: "staff",
        title: "New news submission needs review",
        titleFr: "Nouvelle soumission news à vérifier",
        body: "Demo market repairs — from Demo Contributor. Open the moderation queue to review it.",
        bodyFr: "Réparations du marché démo — de Demo Contributor. Ouvrez la file de modération.",
    },
    {
        event: "submission.confirmation", audience: "user",
        title: "We received your submission",
        titleFr: "Nous avons reçu votre soumission",
        body: "Demo market repairs is now in our editorial queue. We will review it and notify you of the decision here.",
        bodyFr: "Réparations du marché démo est maintenant dans notre file éditoriale.",
        userId: "demo-contributor",
    },
    {
        event: "submission.approved", audience: "user",
        title: "Your submission was published",
        titleFr: "Votre soumission a été publiée",
        body: "Demo market repairs is now live on Eagle Eye Africa.",
        bodyFr: "Réparations du marché démo est maintenant en ligne sur Eagle Eye Africa.",
        userId: "demo-contributor",
    },
    {
        event: "submission.rejected", audience: "user",
        title: "Update on your submission",
        titleFr: "Nouvelles de votre soumission",
        body: "Demo market repairs could not be published: the photos were too dark. You are welcome to submit again.",
        bodyFr: "Réparations du marché démo ne peut être publiée: les photos étaient trop sombres.",
        userId: "demo-contributor",
    },
    {
        event: "submission.clarification", audience: "user",
        title: "We need a detail on your submission",
        titleFr: "Un détail manque sur votre soumission",
        body: "Our editors asked: can you confirm the exact time the market opens? Reply by submitting again or contacting us.",
        bodyFr: "Nos rédacteurs demandent: pouvez-vous confirmer l'heure exacte d'ouverture du marché?",
        userId: "demo-contributor",
    },
    {
        event: "advertise.inquiry", audience: "staff",
        title: "New advertising inquiry",
        titleFr: "Nouvelle demande publicitaire",
        body: "Santa Central Market (contact@santa.cm) wants homepage-banner / leaderboard. Open the ads inquiries tab.",
        bodyFr: "Le marché central de Santa (contact@santa.cm) souhaite bannière-dynamique / leaderboard.",
    },
    {
        event: "advertise.approved", audience: "user",
        title: "Your ad campaign is live",
        titleFr: "Votre campagne est en ligne",
        body: "Santa Central Market — your campaign is now running on Eagle Eye Africa.",
        bodyFr: "Le marché central de Santa — votre campagne est maintenant diffusée.",
        userId: "demo-contributor",
    },
    {
        event: "legal.takedown", audience: "staff",
        title: "New copyright takedown request",
        titleFr: "Nouvelle demande de retrait",
        body: "Claimant RightsCorp filed a takedown for https://eagleeyeafrica.org/photo-stories/bafut-choir.",
        bodyFr: "RightsCorp a déposé un retrait pour https://eagleeyeafrica.org/photo-stories/bafut-choir.",
    },
    {
        event: "legal.contact", audience: "staff",
        title: "New contact message",
        titleFr: "Nouveau message de contact",
        body: "Alex M. wrote about advertising inquiry. Open the legal inbox.",
        bodyFr: "Alex M. a écrit au sujet de demande publicitaire. Ouvrez la boîte juridique.",
    },
    {
        event: "legal.data_request", audience: "staff",
        title: "New privacy/data request",
        titleFr: "Nouvelle demande de données",
        body: "Jordan D. requested account data export. Open the legal inbox.",
        bodyFr: "Jordan D. a demandé un export de données de compte.",
    },
    {
        event: "content.correction", audience: "staff",
        title: "New article correction report",
        titleFr: "Nouveau signalement de correction",
        body: "A reader reported an issue on The Best Achu & Pepe Soup Corner in Mankon. Open trust & safety.",
        bodyFr: "Un lecteur a signalé un problème sur Le meilleur achu et soupe pepe de Mankon.",
    },
    {
        event: "content.updated", audience: "user",
        title: "An article you engaged with was updated",
        titleFr: "Un article que vous avez suivi a été mis à jour",
        body: "Commercial Avenue Reopens was updated: a traffic camera photo was added.",
        bodyFr: "Avenue Commerciale rouvre a été mis à jour: une photo de caméra de surveillance ajoutée.",
        userId: "demo-contributor",
    },
    {
        event: "listing.update", audience: "user",
        title: "Update on your listing",
        titleFr: "Nouvelles de votre annonce",
        body: "Tecno Spark 10 — 128GB: your listing is now marked sold. Manage it from your listings page.",
        bodyFr: "Tecno Spark 10 — 128 Go: votre annonce est marquée comme vendue.",
        userId: "demo-contributor",
    },
    {
        event: "event.reminder", audience: "user",
        title: "Event starting soon",
        titleFr: "Événement imminent",
        body: "Ngoma Festival Announces Full Lineup starts in 2 hours. Don't miss it!",
        bodyFr: "Le festival Ngoma commence dans 2 heures. Ne le manquez pas!",
        userId: "demo-contributor",
    },
    {
        event: "poll.closed", audience: "staff",
        title: "A community poll has closed",
        titleFr: "Un sondage communautaire est clos",
        body: "What should Eagle Eye Africa cover next? — 482 votes recorded. Review the results in the polls panel.",
        bodyFr: "Que devrait couvrir Eagle Eye Africa ensuite? — 482 votes enregistrés.",
    },
    {
        event: "plan.failed", audience: "staff",
        title: "Release plan failed",
        titleFr: "Échec d'un plan de publication",
        body: "The plan weekly-news-recap failed to compile: no content_items found in the last 7 days. Check the automations panel.",
        bodyFr: "Le plan weekly-news-recap n'a pas pu compiler: aucun contenu trouvé.",
    },
    {
        event: "translation.gap", audience: "staff",
        title: "French translation needed",
        titleFr: "Traduction française nécessaire",
        body: "3 published stories lack a French version. Filed in the translation queue.",
        bodyFr: "3 histoires publiées manquent de version française.",
    },
    {
        event: "content.milestone", audience: "user",
        title: "Community milestone",
        titleFr: "Palier communautaire",
        body: "Mankon Market Drainage Rebuild reached 65% of its goal — worth amplifying today.",
        bodyFr: "La collecte pour les canalisations de Mankon a atteint 65% de son objectif.",
        userId: "demo-contributor",
    },
    {
        event: "contributor.milestone", audience: "user",
        title: "A publishing milestone",
        titleFr: "Un cap de publication",
        body: "You have published 50 stories on Eagle Eye Africa. Thank you for keeping the community informed!",
        bodyFr: "Vous avez publié 50 histoires sur Eagle Eye Africa. Merci de tenir informée la communauté!",
        userId: "demo-contributor",
    },
    {
        event: "correction.resolved", audience: "user",
        title: "An article you engaged with was updated",
        titleFr: "Un article que vous avez suivi a été mis à jour",
        body: "Commercial Avenue Reopens was corrected after a reader report. Read the current version.",
        bodyFr: "Avenue Commerciale rouvre a été corrigé après le signalement d'un lecteur.",
        userId: "demo-contributor",
    },
    {
        event: "digest.ready_for_review", audience: "staff",
        title: "A recap draft is ready for review",
        titleFr: "Un brouillon de récapitulatif est prêt à être relu",
        body: "weekly-news-recap compiled 3 new item(s) into a draft. Open the templates page to review and publish.",
        bodyFr: "weekly-news-recap a compilé 3 nouvel(x) élément(s) dans un brouillon.",
    },
    {
        event: "credential.hygiene", audience: "staff",
        title: "Credential hygiene needs attention",
        titleFr: "Hygiène des identifiants à vérifier",
        body: "0 expired · 2 rotation-due · 1 expiring soon (SMTP_HOST, WHATSAPP_TOKEN). Open Credentials to rotate.",
        bodyFr: "0 expiré(s) · 2 à renouveler · 1 bientôt expiré(e). Ouvrez les identifiants.",
    },
    {
        event: "storage.hygiene", audience: "staff",
        title: "Storage tasks need attention",
        titleFr: "Tâches de stockage à vérifier",
        body: "1 failed storage task · 3 still pending · storage at 87% of quota. Open Storage & backup to retry.",
        bodyFr: "1 tâche en échec · 3 encore en attente · stockage à 87% du quota.",
    },
    {
        event: "security.critical", audience: "staff",
        title: "Critical mode activated",
        titleFr: "Mode critique activé",
        body: "Severe weather warning issued by the national meteorological service — the platform is in CRITICAL state. Open the incident console.",
        bodyFr: "Alerte météorologique sévère émise par le service météorologique national.",
    },
    {
        event: "system.degraded", audience: "staff",
        title: "Platform health degraded",
        titleFr: "Santé de la plateforme dégradée",
        body: "Telemetry tripped DEGRADED (API latency above 5s for >2min). Open Platform states to confirm or clear.",
        bodyFr: "La télémétrie a déclenché l'état DÉGRADÉ (latence API > 5s).",
    },
];

const DEMO_SUBSCRIBERS = [
    { email: "demo-notify@example.com", locale: "en", active: false, pitch: "standard" },
    { email: "demo-notifications@example.com", locale: "fr", active: false, pitch: "diaspora" },
];

export default {
    id: "notify-demo-outbox",
    family: "notify",
    tier: 7,
    audience: "local",
    title: "Notification loop demo",
    titleFr: "Boucle de notification de démonstration",
    what: "One pending outbox row per event type (all 22 from lib/notify/events.ts) + an inactive digest subscriber + demo prefs, so /admin/notifications and /account/notifications render every path. Local-only via the production guard — a live DB must never hold fabricated alerts.",
    tables: ["notification_outbox", "digest_subscribers", "notification_prefs"],
    deps: ["people-demo"],
    async rows(ctx) {
        await ctx.load("notification_outbox");
        await ctx.load("digest_subscribers");

        const contributorId = ctx.uuid("profile/demo-contributor");
        const demoUserId = ctx.uuid("profile/sarah-n");
        const out = [];

        const now = ctx.now.toISOString();

        for (const row of DEMO_OUTBOX) {
            const data = { demo: "seed-notify", event: row.event };
            if (row.userId) {
                data.userId = row.userId === "demo-contributor" ? contributorId : demoUserId;
            }
            out.push({
                table: "notification_outbox", row: {
                    id: ctx.uuid(`notify/outbox/${row.event}`),
                    event: row.event,
                    audience: row.audience,
                    title: row.title,
                    title_fr: row.titleFr,
                    body: row.body,
                    body_fr: row.bodyFr,
                    data,
                    status: "pending",
                    channels_sent: row.audience === "staff" ? ["inapp", "email"] : ["inapp", "email"],
                    attempts: 0,
                    next_attempt_at: now,
                    created_at: ctx.iso(-1),
                },
                note: `demo outbox ${row.event}`,
            });
        }

        // --- digest subscribers ---
        await ctx.load("digest_subscribers");
        for (const sub of DEMO_SUBSCRIBERS) {
            out.push({
                table: "digest_subscribers", row: {
                    id: ctx.uuid(`digest/${sub.email}`),
                    email: sub.email,
                    phone: null, whatsapp: null,
                    locale: sub.locale,
                    diaspora_mode: sub.pitch === "diaspora",
                    pitch_variant: sub.pitch,
                    is_active: sub.active,
                    created_at: ctx.iso(-1),
                },
                note: `demo digest subscriber ${sub.email}`,
            });
        }

        // --- notification prefs for the demo contributor ---
        out.push({
            table: "notification_prefs", row: {
                user_id: contributorId,
                inapp: true, email: true, whatsapp: true,
                locale: "en",
                quiet_start: 22, quiet_end: 7,
            },
            note: "demo prefs: WhatsApp on, quiet 22→7",
        });

        return out;
    },
};

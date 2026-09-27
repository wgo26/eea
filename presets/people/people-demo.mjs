/**
 * Pack: people-demo — demo contributor profiles.
 *
 * The editorial pack's content is credited to real demo authors and reports
 * from demo contributors. These profiles make the bylines genuine, give the
 * /contributors directory something to render, and let the moderation and
 * trust-safety flows attribute submissions to a real (demo) identity.
 *
 * Audience: staging. These are demo people, not real ones — safe for local
 * by default. Content items already use `submitted_by`/`author_id` columns
 * that accept null, so a production project without these profiles still works.
 *
 * NOTE: profiles.id references auth.users(id) via ON DELETE CASCADE on the
 * schema side, but seed writes happen at the DB level (not through auth), so
 * these rows are inserted with a caller-chosen id that matches a known demo
 * auth user. On a local dev DB the demo auth users are created by the
 * supabase seed function (supabase/seed.sql). This pack writes only profile
 * metadata; it does not create auth users.
 *
 * deps: tax-locations for the location_id foreign key.
 */

const CONTRIBUTORS = [
    {
        slug: "sarah-n",
        displayName: "Sarah N.",
        fullName: "Sarah Ndifor",
        bioEn: "Freelance photographer covering daily life in the North West. Her work has appeared in local weeklies.",
        bioFr: "Photographe freelance couvrant la vie quotidienne dans le Nord-Ouest.",
        location: "bamenda",
        phone: "+237 6 72 00 01 01",
        role: "contributor",
        verified: true,
    },
    {
        slug: "eyong-b",
        displayName: "Eyong B.",
        fullName: "Eyong Banda",
        bioEn: "Community reporter based in Nkwen. Covers infrastructure and local governance.",
        bioFr: "Reporter communautaire basé à Nkwen. Couverture des infrastructures et de la gouvernance locale.",
        location: "bamenda",
        phone: "+237 6 72 00 01 02",
        role: "contributor",
        verified: true,
    },
    {
        slug: "mireille-t",
        displayName: "Mireille T.",
        fullName: "Mireille Tchatchoua",
        bioEn: "Writer and cultural organiser from Bafut. Focuses on music, food and traditions.",
        bioFr: "Écrivaine et organisatrice culturelle de Bafut. Axée sur la musique, la cuisine et les traditions.",
        location: "bafut",
        phone: "+237 6 72 00 01 03",
        role: "contributor",
        verified: true,
    },
    {
        slug: "kiven-d",
        displayName: "Kiven D.",
        fullName: "Kiven Doh",
        bioEn: "Night-shift motorcycle taxi driver and amateur street photographer in Bamenda.",
        bioFr: "Chauffeur de taxi-moto de nuit et photographe de rue amateur à Bamenda.",
        location: "bamenda",
        phone: "+237 6 72 00 01 04",
        role: "contributor",
        verified: false,
    },
    {
        slug: "demo-contributor",
        displayName: "Demo Contributor",
        fullName: "Demo Contributor",
        bioEn: "Placeholder profile used by the seed to stand in for unsigned submissions.",
        bioFr: "Profil de remplacement utilisé par l'importation pour les soumissions non signées.",
        location: null,
        phone: null,
        role: null,
        verified: false,
    },
];

export default {
    id: "people-demo",
    family: "people",
    tier: 0,
    audience: "staging",
    title: "Demo contributors",
    titleFr: "Contributeurs de démonstration",
    what: "Demo author/contributor profiles so bylines, the contributors directory, and moderation attribution are genuine. Does not create auth users — relies on the demo auth identities in supabase/seed.sql.",
    tables: ["profiles", "user_roles"],
    deps: ["tax-locations"],
    async rows(ctx) {
        await ctx.load("profiles");
        await ctx.load("user_roles");
        await ctx.load("locations");

        const locId = (slug) => ctx.id("locations", slug);
        const out = [];

        for (const c of CONTRIBUTORS) {
            // Deterministic uuid from the contributor slug — stable across re-runs.
            const id = ctx.uuid(`profile/${c.slug}`);
            out.push({
                table: "profiles", row: {
                    id,
                    display_name: c.displayName,
                    full_name: c.fullName,
                    bio: c.bioEn,
                    phone: c.phone,
                    email: null,
                    avatar_url: `https://i.pravatar.com/150?u=${c.slug}`,
                    location_id: c.location ? locId(c.location) : null,
                    is_verified: c.verified,
                    is_public: true,
                    preferred_locale: "en",
                    preferred_voice: "formal",
                },
                note: `demo profile ${c.slug}`,
            });

            if (c.role) {
                out.push({
                    table: "user_roles", row: {
                        user_id: id, role: c.role,
                    },
                    note: `role ${c.role} for ${c.slug}`,
                });
            }
        }
        return out;
    },
};

/**
 * Pack: brand-state-demo — brand themes, assets and contextual system states.
 *
 * Seeds the data-backed platform states and the default brand so every
 * contextual surface (the state-aware recap templates, the emergency-publish
 * panel, the branding admin) has real rows to operate on.
 *
 * System states are already inserted by migration
 * 20261027000000_admin_audit_infrastructure.sql (the spec §20 ladder), so this
 * pack SEED-IF-ABSENT only — it skips any id that already exists.
 *
 * Emergency publish presets: a set of ready-made notice templates for the
 * common crisis scenarios (severe weather, outage, health emergency), so the
 * /admin/emergency panel can demonstrate one-click publishing without staff
 * having to author a template first. These require two-person approval.
 *
 * Brand theme: a default "published" theme with the EEA green palette, set as
 * the active one so the theming admin has a live theme to show. On a local
 * dev DB, this is safe to upsert; on production the operator owns the theme.
 *
 * Audience: staging (demo states + demo brand; a live site has its own).
 */

const SYSTEM_STATES = [
    { id: "NORMAL", name: "Normal Operations", nameFr: "Fonctionnement normal", severity: "normal", active: true, precedence: 0, visual: "default", modules: [], behavior: {} },
    { id: "SEASONAL", name: "Seasonal Campaign", nameFr: "Campagne saisonnière", severity: "info", active: false, precedence: 10, visual: "seasonal", modules: ["home", "news", "culture"], behavior: { notifications: "campaign", contentPriority: "campaign" } },
    { id: "HIGH_ACTIVITY", name: "High Activity", nameFr: "Activité élevée", severity: "info", active: false, precedence: 20, visual: "high-activity", modules: ["home", "listings", "notices"], behavior: { notifications: "elevated", contentPriority: "recency" } },
    { id: "MAINTENANCE", name: "Scheduled Maintenance", nameFr: "Maintenance planifiée", severity: "warning", active: false, precedence: 30, visual: "maintenance", modules: ["submissions", "listings"], behavior: { notifications: "maintenance", contentPriority: "editorial" } },
    { id: "DEGRADED", name: "Degraded Service", nameFr: "Service dégradé", severity: "warning", active: false, precedence: 40, visual: "degraded", modules: ["submissions", "media", "listings"], behavior: { notifications: "elevated", contentPriority: "editorial" } },
    { id: "RECOVERY", name: "Recovering", nameFr: "Rétablissement", severity: "info", active: false, precedence: 45, visual: "recovery", modules: ["submissions", "media"], behavior: { notifications: "elevated", contentPriority: "editorial" } },
    { id: "INCIDENT", name: "Active Incident", nameFr: "Incident actif", severity: "warning", active: false, precedence: 50, visual: "incident", modules: [], behavior: { notifications: "incident", contentPriority: "operational" } },
    { id: "CRITICAL", name: "Critical Platform State", nameFr: "État critique de la plateforme", severity: "critical", active: false, precedence: 60, visual: "critical", modules: [], behavior: { notifications: "critical", contentPriority: "operational", motion: "minimal" } },
];

const EMERGENCY_PRESETS = [
    {
        name: "Severe Weather Warning",
        content_type: "notice",
        severity: "alert",
        template: {
            title: "Severe Weather Alert — [Area] Under Heavy Rain",
            titleFr: "Alerte météorologique sévère — [Zone] sous fortes pluies",
            body: "Heavy rains with flash flood risk starting [time]. Avoid low-lying roads and market areas near streams. Updates at [url].",
            bodyFr: "Des pluies fortes avec risque d'inondation rapide à partir de [heure]. À éviter les routes en contrebas et les zones de marché près des rivières.",
            notice_type: "service_announcement",
            organization_name: "National Meteorological Service",
            is_official: true,
            verification: "official_source",
        },
    },
    {
        name: "Service Outage",
        content_type: "notice",
        severity: "alert",
        template: {
            title: "Service Disruption — [Service] Offline",
            titleFr: "Dysfonctionnement du service — [Service] hors ligne",
            body: "[Service] is currently offline. Engineers are working on it. Expected restoration: [time].",
            bodyFr: "[Service] est actuellement hors ligne. Les ingénieurs travaillent dessus. Rétablissement prévu: [heure].",
            notice_type: "public_notice",
            organization_name: "Eagle Eye Africa",
            is_official: true,
            verification: "official_source",
        },
    },
    {
        name: "Health Emergency",
        content_type: "notice",
        severity: "critical",
        template: {
            title: "Health Alert — [Disease] Reported in [Area]",
            titleFr: "Alerte sanitaire — [Maladie] signalée à [Zone]",
            body: "Cases of [disease] have been confirmed in [area]. Avoid gatherings and visit [facility] if symptomatic. Vaccination at [location].",
            bodyFr: "Des cas de [maladie] ont été confirmés à [zone]. Évitez les rassemblements et rendez-vous à [structure] si symptôme.",
            notice_type: "community_alert",
            organization_name: "District Health Service",
            is_official: true,
            verification: "official_source",
        },
    },
];

export default {
    id: "brand-state-demo",
    family: "brand-state",
    tier: 0,
    audience: "staging",
    title: "Branding and platform states",
    titleFr: "Identité visuelle et états de la plateforme",
    what: "The spec §20 system-state ladder (NORMAL … CRITICAL), emergency-publish presets for crisis notices, and a default published brand theme — so the state-aware templates and emergency panel have real rows to operate on.",
    tables: ["system_states", "emergency_publishing_presets", "brand_themes", "brand_theme_versions", "brand_assets", "brand_asset_usage"],
    deps: [],
    async rows(ctx) {
        await ctx.load("system_states");
        const out = [];

        // --- system states (seed-if-absent, migrations may have already inserted) ---
        for (const s of SYSTEM_STATES) {
            if (ctx.exists("system_states", s.id)) continue;
            out.push({
                table: "system_states", row: {
                    id: s.id,
                    name: s.name,
                    severity: s.severity,
                    active: s.active,
                    precedence: s.precedence,
                    visual_profile: s.visual,
                    affected_modules: s.modules,
                    behavior_profile: s.behavior,
                    accessibility_profile: s.severity === "critical" ? "high-contrast" : "standard",
                    created_at: ctx.now.toISOString(),
                    updated_at: ctx.now.toISOString(),
                },
                note: `state ${s.id}`,
            });
        }

        // --- emergency publish presets ---
        for (const ep of EMERGENCY_PRESETS) {
            const id = ctx.uuid(`emergency/${ep.name.toLowerCase().replace(/\s+/g, "-")}`);
            out.push({
                table: "emergency_publishing_presets", row: {
                    id, name: ep.name, content_type: ep.content_type,
                    template: ep.template, requires_two_person: true,
                    created_at: ctx.now.toISOString(),
                },
                note: `emergency preset ${ep.name}`,
            });
        }

        // --- default brand theme (published) ---
        const themeName = "EEA Default";
        const themeId = ctx.uuid(`brand/theme/${themeName}`);
        const existing = ctx.exists("brand_themes", themeName, "1.1") ||
                         ctx.exists("brand_themes", themeName, "1.0");
        if (!existing) {
            const tokens = {
                primary: { DEFAULT: "#0f3d2e", dark: "#0c3227", light: "#134d39" },
                secondary: { DEFAULT: "#d4a72c", dark: "#b8860b", light: "#e6c24a" },
                background: { DEFAULT: "#f4f4f2", card: "#ffffff" },
                foreground: { DEFAULT: "#1a1a1a", muted: "#6b6b6b" },
                border: { DEFAULT: "#e0e0e0" },
            };
            out.push({
                table: "brand_themes", row: {
                    id: themeId, name: themeName, version: "1.0",
                    tokens: JSON.stringify(tokens),
                    status: "published", is_active: true,
                    created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
                },
                note: "default published brand theme",
            });
            out.push({
                table: "brand_theme_versions", row: {
                    id: ctx.uuid(`brand/theme/${themeName}/1.0`),
                    theme_id: themeId, version: "1.0",
                    tokens: JSON.stringify(tokens),
                    change_summary: "Initial EEA green palette",
                    created_at: ctx.now.toISOString(),
                },
                note: "theme version 1.0",
            });
        }

        // --- brand assets (logo, wordmark, icon) ---
        const ASSETS = [
            { name: "EEA Logo", type: "logo", url: "/brand/eagle-eye-mark.svg", role: "logo" },
            { name: "EEA Wordmark", type: "wordmark", url: "/brand/eagle-eye-wordmark.svg", role: "wordmark" },
            { name: "EEA Icon", type: "icon", url: "/brand/eagle-eye-icon.svg", role: "icon" },
        ];
        for (const a of ASSETS) {
            const id = ctx.uuid(`brand/asset/${a.name}`);
            out.push({
                table: "brand_assets", row: {
                    id, name: a.name, type: a.type, file_url: a.url,
                    provider: "static", storage_key: a.url,
                    dimensions: JSON.stringify({ width: 0, height: 0 }),
                    format: "svg", size_bytes: 0, version: 1,
                    is_active: true,
                },
                note: `brand asset ${a.type}`,
            });
            out.push({
                table: "brand_asset_usage", row: {
                    id: ctx.uuid(`brand/usage/${a.name}`),
                    asset_id: id, theme_id: themeId, role: a.role,
                },
                note: `theme binding for ${a.name}`,
            });
        }

        return out;
    },
};

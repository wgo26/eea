/**
 * Pack: admin-ux-demo — admin widget layouts.
 *
 * Seeds the default dashboard widget layout for the admin home so the
 * "Remove demo data" check in lib/admin/demo-data.ts sees a populated
 * layout and the admin shell renders a sensible starting arrangement
 * rather than an empty grid.
 *
 * The homepage_slots curation is handled in ed-demo-content — this pack
 * only covers the admin dashboard itself.
 *
 * Audience: staging.
 */

export default {
    id: "admin-ux-demo",
    family: "admin-ux",
    tier: 0,
    audience: "staging",
    title: "Admin dashboard layout",
    titleFr: "Mise en page du tableau de bord",
    what: "Default admin widget layout for the dashboard home, so the admin shell renders a curated starting arrangement of content, moderation, and engagement widgets.",
    tables: ["admin_widget_layouts"],
    deps: [],
    async rows(ctx) {
        await ctx.load("admin_widget_layouts");

        const out = [];
        const layoutId = ctx.uuid("admin/layout/default");

        const systemUserId = ctx.uuid("profile/system-default");
 
        if (!ctx.exists("admin_widget_layouts", systemUserId)) {
            out.push({
                table: "admin_widget_layouts", row: {
                    id: layoutId,
                    user_id: systemUserId,
                    name: "default",
                    is_default: true,
                    widgets: JSON.stringify([
                        { id: "content-stats", col: 1, row: 1, size: "sm" },
                        { id: "moderation-queue", col: 2, row: 1, size: "md" },
                        { id: "notification-outbox", col: 3, row: 1, size: "md" },
                        { id: "publish-plans", col: 1, row: 2, size: "lg" },
                        { id: "system-states", col: 2, row: 2, size: "sm" },
                        { id: "ad-campaigns", col: 3, row: 2, size: "md" },
                    ]),
                    created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
                },
                note: "default admin dashboard layout",
            });
        }
        return out;
    },
};

'use server'

/**
 * Dashboard widget layout actions (plan Phase 4.4, spec §35).
 *
 * Spec §35 asks for a dashboard the viewer arranges themselves. Only the
 * *arrangement* is data (see the `admin_widget_layouts` migration): the widgets
 * themselves are code, and the ids are validated against the registry
 * vocabulary in `lib/admin/widget-layout.ts` before they are stored.
 *
 * Deviation from the plan's literal signature: `saveDashboardLayout(userId, …)`
 * takes the user id from the session instead. A client-supplied id would let
 * any editor rewrite another editor's layout through the service-role client
 * (which bypasses the table's SELECT-only RLS), so the parameter is dropped
 * rather than validated. Resetting is a DELETE: no row means "use the role
 * defaults", so there is nothing to write.
 *
 * Both actions are gated on `viewDashboard` — the capability that already opens
 * /admin/dashboard. Rearranging your own dashboard is not a privileged act, so
 * it does not need an administrative capability on top.
 */

import { assertCapability } from '@/lib/admin/auth'
import { sanitizeWidgetLayout } from '@/lib/admin/widget-layout'
import { isAdminRoles } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

export async function saveDashboardLayout(layout: string[]): Promise<ActionResult> {
    try {
        const ctx = await assertCapability('viewDashboard')
        const widgets = sanitizeWidgetLayout(Array.isArray(layout) ? layout : [])
        const admin = createAdminClient()

        const { error } = await admin.from('admin_widget_layouts').upsert(
            {
                user_id: ctx.user.id,
                role: isAdminRoles(ctx.roles) ? 'admin' : 'editor',
                widgets,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
        )
        if (error) return { ok: false, error: error.message }

        await auditEvent(ctx.user.id, {
            action: 'dashboard.layout_saved',
            actorRole: ctx.roles.join(',') || null,
            resourceType: 'admin_widget_layout',
            resourceId: ctx.user.id,
            // Widget ids only — a layout preference carries nothing sensitive.
            metadata: { widgets },
        })
        revalidateLocalized('/admin/dashboard')
        return { ok: true }
    } catch (e) {
        return fail(e)
    }
}

export async function resetDashboardLayout(): Promise<ActionResult> {
    try {
        const ctx = await assertCapability('viewDashboard')
        const admin = createAdminClient()

        const { error } = await admin.from('admin_widget_layouts').delete().eq('user_id', ctx.user.id)
        if (error) return { ok: false, error: error.message }

        await auditEvent(ctx.user.id, {
            action: 'dashboard.layout_reset',
            actorRole: ctx.roles.join(',') || null,
            resourceType: 'admin_widget_layout',
            resourceId: ctx.user.id,
            metadata: { restored: 'role_defaults' },
        })
        revalidateLocalized('/admin/dashboard')
        return { ok: true }
    } catch (e) {
        return fail(e)
    }
}

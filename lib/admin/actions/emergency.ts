'use server'

/**
 * Emergency publishing (plan Phase 5.1, spec §41).
 *
 * Rapid publish for emergency notices, public-safety notices, service
 * disruptions, community alerts and important corrections. The flow bypasses
 * the normal submission review queue but retains the full accountability
 * trail the spec demands: author, timestamp, authorization and audit record.
 *
 * Two-person control (spec §44): a `critical` severity publish — or any
 * preset flagged `requires_two_person` — needs a second administrator's
 * approval (`emergency.publish` in lib/admin/two-person-control.ts). Without
 * an approval id the action raises the request and returns
 * `approvalRequired` so the UI can point the operator at /admin/approvals;
 * with an id it verifies the grant and consumes it single-use after success.
 *
 * All writes use the service-role client: the Phase 5 tables are
 * SELECT-only under RLS, so the cookie-scoped client could never write.
 */

import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient, type InsertOf } from '@/lib/supabase/admin'
import {
  checkApproval,
  consumeApproval,
  requestTwoPersonApproval,
} from '@/lib/admin/two-person-control'
import {
  audit,
  auditEvent,
  fail,
  revalidateLocalized,
  revalidatePublicContentCache,
  uniqueSlug,
  upsertTranslations,
} from './_shared'

export type EmergencySeverity = 'info' | 'warning' | 'critical'

const SEVERITIES: EmergencySeverity[] = ['info', 'warning', 'critical']

export type EmergencyPublishInput = {
  title: string
  body: string
  severity?: EmergencySeverity
  presetId?: string | null
  /** Second-administrator grant for gated publishes (spec §44). */
  approvalId?: string | null
  /** Operator prose stored on the approval request / audit trail. */
  reason?: string | null
}

export type EmergencyPublishResult =
  | { ok: true; id: string }
  | { ok: false; error: string; approvalRequired?: boolean; approvalId?: string }

export type EmergencyPreset = {
  id: string
  name: string
  contentType: string
  template: Record<string, unknown>
  requiresTwoPerson: boolean
  createdAt: string | null
}

export type EmergencyEvent = {
  id: string
  contentItemId: string
  contentTitle: string | null
  presetId: string | null
  presetName: string | null
  severity: string
  actorId: string
  actorName: string | null
  approvalId: string | null
  createdAt: string | null
}

function asName(value: unknown): string | null {
  const row = (Array.isArray(value) ? value[0] : value) as {
    display_name: string | null
    full_name: string | null
  } | null | undefined
  return row?.display_name ?? row?.full_name ?? null
}

function normalizeSeverity(value: unknown): EmergencySeverity {
  return SEVERITIES.includes(value as EmergencySeverity) ? (value as EmergencySeverity) : 'warning'
}

/** Presets + recent emergency publishes for the emergency console. */
export async function getEmergencyConsole(): Promise<{ presets: EmergencyPreset[]; events: EmergencyEvent[] }> {
  const empty = { presets: [], events: [] }
  try {
    await assertCapability('manageContent')
  } catch {
    return empty
  }
  const admin = createAdminClient()
  const [{ data: presets }, { data: events }] = await Promise.all([
    admin
      .from('emergency_publishing_presets')
      .select('id, name, content_type, template, requires_two_person, created_at')
      .order('name', { ascending: true })
      .limit(50),
    admin
      .from('emergency_publish_events')
      .select(
        `id, content_item_id, preset_id, severity, actor_id, approval_id, created_at,
        actor:profiles!emergency_publish_events_actor_id_fkey(display_name, full_name),
        preset:emergency_publishing_presets(name),
        content:content_items(translations:content_translations(locale, title))`,
      )
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  return {
    presets: ((presets ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      contentType: (p.content_type as string) ?? 'notice',
      template:
        p.template && typeof p.template === 'object' && !Array.isArray(p.template)
          ? (p.template as Record<string, unknown>)
          : {},
      requiresTwoPerson: (p.requires_two_person as boolean) ?? false,
      createdAt: (p.created_at as string | null) ?? null,
    })),
    events: ((events ?? []) as unknown as Record<string, unknown>[]).map((e) => {
      const translations = (e.content as { translations?: { locale: string; title: string }[] } | null)
        ?.translations
      const list = Array.isArray(translations) ? translations : []
      return {
        id: e.id as string,
        contentItemId: e.content_item_id as string,
        contentTitle: list.find((t) => t.locale === 'en')?.title ?? list[0]?.title ?? null,
        presetId: (e.preset_id as string | null) ?? null,
        presetName:
          (e.preset as { name?: string } | null)?.name ??
          (Array.isArray(e.preset) ? (e.preset[0] as { name?: string } | undefined)?.name : undefined) ??
          null,
        severity: (e.severity as string) ?? 'warning',
        actorId: e.actor_id as string,
        actorName: asName(e.actor),
        approvalId: (e.approval_id as string | null) ?? null,
        createdAt: (e.created_at as string | null) ?? null,
      }
    }),
  }
}

export async function createEmergencyPreset(input: {
  name: string
  contentType?: string
  template?: Record<string, unknown>
  requiresTwoPerson?: boolean
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('manageContent')
    const name = input.name.trim().slice(0, 120)
    if (!name) return { ok: false, error: 'A preset name is required.' }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('emergency_publishing_presets')
      .insert({
        name,
        content_type: (input.contentType ?? 'notice').slice(0, 60),
        template: (input.template ?? {}) as unknown as InsertOf<'emergency_publishing_presets'>['template'],
        requires_two_person: input.requiresTwoPerson ?? false,
        created_by: ctx.user.id,
      } as InsertOf<'emergency_publishing_presets'>)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create the preset.' }
    await auditEvent(ctx.user.id, {
      action: 'emergency.preset_created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'emergency_publishing_preset',
      resourceId: (data as { id: string }).id,
      metadata: { name },
    })
    revalidateLocalized('/admin/emergency')
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Publish an emergency notice immediately. Creates the `content_items` row
 * (type `notice`, status `published`), its English translation, the `notices`
 * extension row and the `emergency_publish_events` audit row in one flow —
 * a half-built publish is rolled back so a retry never collides on the slug.
 */
export async function publishEmergencyNotice(input: EmergencyPublishInput): Promise<EmergencyPublishResult> {
  try {
    const ctx = await assertCapability('manageContent')
    const title = input.title.trim().slice(0, 300)
    const body = input.body.trim().slice(0, 100000)
    if (!title) return { ok: false, error: 'A headline is required.' }
    if (!body) return { ok: false, error: 'The notice body is required.' }
    const severity = normalizeSeverity(input.severity)

    const admin = createAdminClient()

    let presetId: string | null = null
    let presetRequiresTwoPerson = false
    if (input.presetId) {
      const { data: presetRow } = await admin
        .from('emergency_publishing_presets')
        .select('id, requires_two_person')
        .eq('id', input.presetId)
        .maybeSingle()
      const preset = (presetRow ?? null) as { id: string; requires_two_person: boolean } | null
      if (!preset) return { ok: false, error: 'Preset not found.' }
      presetId = preset.id
      presetRequiresTwoPerson = preset.requires_two_person
    }

    // Spec §44 gate: critical publishes always need a second signature, as
    // do presets flagged `requires_two_person`.
    const needsApproval = severity === 'critical' || presetRequiresTwoPerson === true
    if (needsApproval) {
      if (!input.approvalId) {
        const req = await requestTwoPersonApproval({
          action: 'emergency.publish',
          actorId: ctx.user.id,
          resourceType: 'emergency_publish',
          resourceId: presetId,
          reason: input.reason ?? `${severity}: ${title}`.slice(0, 280),
        })
        if (!req.ok) return { ok: false, error: req.error }
        return {
          ok: false,
          error: 'A second administrator must approve this emergency publish before it goes live.',
          approvalRequired: true,
          approvalId: req.id,
        }
      }
      const verdict = await checkApproval({
        approvalId: input.approvalId,
        action: 'emergency.publish',
        actorId: ctx.user.id,
        resourceType: 'emergency_publish',
        resourceId: presetId,
      })
      if (!verdict.ok) return { ok: false, error: verdict.error }
    }

    const now = new Date().toISOString()
    const slug = await uniqueSlug(admin, `emergency-${title}` || 'emergency')
    const { data: created, error: createErr } = await admin
      .from('content_items')
      .insert({ type: 'notice', slug, status: 'draft' })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the notice.' }
    const contentId = (created as { id: string }).id

    try {
      await upsertTranslations(admin, contentId, [{ locale: 'en', title, body }])
      const { error: nErr } = await admin.from('notices').insert({
        content_item_id: contentId,
        notice_type: 'community_alert',
        is_official: true,
      })
      if (nErr) throw new Error(`Could not create the notice detail: ${nErr.message}`)
      const { error: flipErr } = await admin
        .from('content_items')
        .update({ status: 'published', published_at: now })
        .eq('id', contentId)
      if (flipErr) throw new Error(flipErr.message)
      const { error: evErr } = await admin.from('emergency_publish_events').insert({
        preset_id: presetId,
        content_item_id: contentId,
        actor_id: ctx.user.id,
        approval_id: input.approvalId ?? null,
        severity,
      })
      if (evErr) throw new Error(`Could not record the emergency event: ${evErr.message}`)
    } catch (e) {
      await admin.from('content_items').delete().eq('id', contentId)
      return fail(e)
    }

    if (input.approvalId) await consumeApproval(input.approvalId)

    // Spec §41 — author, timestamp, authorization and audit record survive
    // the bypass: moderation_log keeps the content-pipeline trail, audit_events
    // the system trail with the two-person grant attached.
    await audit(admin, ctx.user.id, {
      action: 'emergency_publish',
      contentItemId: contentId,
      entityType: 'notice',
      entityId: contentId,
      toStatus: 'published',
      notes: `${severity}${presetId ? ` · preset ${presetId}` : ''}${input.reason ? ` · ${input.reason.slice(0, 200)}` : ''}`,
    })
    await auditEvent(ctx.user.id, {
      action: 'emergency.publish',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'emergency_publish',
      resourceId: contentId,
      metadata: { severity, presetId, approvalId: input.approvalId ?? null, title: title.slice(0, 140) },
    })

    revalidatePublicContentCache()
    revalidateLocalized('/admin/emergency')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    return { ok: true, id: contentId }
  } catch (e) {
    return fail(e)
  }
}

/** Backwards-compatible alias for the plan's `createEmergencyPublish` name. */
export async function createEmergencyPublish(input: EmergencyPublishInput): Promise<EmergencyPublishResult> {
  return publishEmergencyNotice(input)
}

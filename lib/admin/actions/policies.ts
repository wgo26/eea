'use server'

import { revalidateTag } from 'next/cache'
import { assertCapability } from '@/lib/admin/auth'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { type ActionResult, audit, fail, revalidateLocalized } from './_shared'

/* ------------------------------------------------------------------ */
/* Legal policies                                                      */
/* ------------------------------------------------------------------ */

const POLICY_TYPES = ['terms', 'privacy', 'guidelines', 'copyright', 'contact'] as const

/** Publish a new policy version and mark it current (one current per type+locale). */
export async function createPolicyVersion(input: {
  policyType: string
  locale: 'en' | 'fr'
  version: string
  content: string
}): Promise<ActionResult> {
  try {
    const policyType = input.policyType.trim()
    const version = input.version.trim()
    const content = input.content.trim()
    if (!POLICY_TYPES.includes(policyType as (typeof POLICY_TYPES)[number])) {
      return { ok: false, error: 'Unknown policy type.' }
    }
    if (!version || !content) return { ok: false, error: 'Version and content are required.' }

    const { supabase, user } = await assertCapability('managePolicies')

    const { error: clearErr } = await supabase
      .from('policy_versions')
      .update({ is_current: false })
      .eq('policy_type', policyType)
      .eq('locale', input.locale)
    if (clearErr) return { ok: false, error: clearErr.message }

    const { error } = await supabase.from('policy_versions').insert({
      policy_type: policyType,
      locale: input.locale,
      version,
      content,
      is_current: true,
    })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'policy:version:create',
      notes: `${policyType} ${input.locale} v${version}`,
    })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Point a type+locale at an older version (history rollback). */
export async function setCurrentPolicy(policyId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { data, error: readErr } = await supabase
      .from('policy_versions')
      .select('id, policy_type, locale')
      .eq('id', policyId)
      .limit(1)
    const target = (data ?? [])[0] as
      | { id: string; policy_type: string; locale: string }
      | undefined
    if (readErr || !target) return { ok: false, error: 'Policy version not found.' }

    const { error: clearErr } = await supabase
      .from('policy_versions')
      .update({ is_current: false })
      .eq('policy_type', target.policy_type)
      .eq('locale', target.locale)
    if (clearErr) return { ok: false, error: clearErr.message }

    const { error } = await supabase
      .from('policy_versions')
      .update({ is_current: true })
      .eq('id', policyId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'policy:version:current',
      notes: `policy=${policyId} ${target.policy_type} ${target.locale}`,
    })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Edit a version's body in place (typo fixes without a new version). */
export async function updatePolicyContent(
  policyId: string,
  content: string,
): Promise<ActionResult> {
  try {
    if (!content.trim()) return { ok: false, error: 'Content is required.' }
    const { supabase, user } = await assertCapability('managePolicies')
    const { error } = await supabase
      .from('policy_versions')
      .update({ content: content.trim() })
      .eq('id', policyId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'policy:version:edit', notes: `policy=${policyId}` })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a version. Current versions are protected — roll back first. */
export async function deletePolicyVersion(policyId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { data } = await supabase
      .from('policy_versions')
      .select('id, is_current')
      .eq('id', policyId)
      .limit(1)
    const target = (data ?? [])[0] as { id: string; is_current: boolean } | undefined
    if (!target) return { ok: false, error: 'Policy version not found.' }
    if (target.is_current) {
      return { ok: false, error: 'This version is current — set another version current first.' }
    }
    const { error } = await supabase.from('policy_versions').delete().eq('id', policyId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'policy:version:delete', notes: `policy=${policyId}` })
    revalidateLocalized('/admin/policies')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* About index overrides                                               */
/* ------------------------------------------------------------------ */

const ABOUT_SECTION_KEYS = [
  'hero',
  'loop',
  'stats',
  'pipeline',
  'values',
  'charter',
  'closing',
] as const

/** Upsert one locale's override for an /about index section. Empty fields
 *  fall back to the dictionary at render; clearing all fields removes the
 *  override row so the dictionary shines through untouched. */
export async function saveAboutSection(input: {
  sectionKey: string
  locale: 'en' | 'fr'
  heading?: string | null
  body?: string | null
  ctaLabel?: string | null
  ctaHref?: string | null
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    if (!ABOUT_SECTION_KEYS.includes(input.sectionKey as (typeof ABOUT_SECTION_KEYS)[number])) {
      return { ok: false, error: 'Unknown section.' }
    }
    const { supabase, user } = await assertCapability('managePolicies')
    const patch = {
      heading: input.heading?.trim() || null,
      body: input.body?.trim() || null,
      cta_label: input.ctaLabel?.trim() || null,
      cta_href: input.ctaHref?.trim() || null,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    }
    if (!patch.heading && !patch.body && !patch.cta_label) {
      const { error } = await supabase
        .from('about_sections')
        .delete()
        .eq('section_key', input.sectionKey)
        .eq('locale', input.locale)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('about_sections').upsert(
        {
          section_key: input.sectionKey,
          locale: input.locale,
          ...patch,
        },
        { onConflict: 'section_key,locale' },
      )
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: 'about:section:save',
      notes: `${input.sectionKey} ${input.locale}`,
    })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Advertise page overrides + site settings (footer social links)     */
/* ------------------------------------------------------------------ */

const ADVERTISE_SECTION_KEYS = [
  'title',
  'tagline',
  'intro',
  'placements',
  'audience',
  'pricing',
] as const

/** Upsert one locale's override for an /advertise section. Empty fields
 *  fall back to the dictionary at render; clearing all fields removes the
 *  override row so the dictionary shines through untouched. */
export async function saveAdvertiseSection(input: {
  sectionKey: string
  locale: 'en' | 'fr'
  heading?: string | null
  body?: string | null
}): Promise<ActionResult> {
  try {
    if (!ADVERTISE_SECTION_KEYS.includes(input.sectionKey as (typeof ADVERTISE_SECTION_KEYS)[number])) {
      return { ok: false, error: 'Unknown section.' }
    }
    const { supabase, user } = await assertCapability('manageSiteContent')
    const patch = {
      heading: input.heading?.trim() || null,
      body: input.body?.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    if (!patch.heading && !patch.body) {
      const { error } = await supabase
        .from('advertise_sections')
        .delete()
        .eq('section_key', input.sectionKey)
        .eq('locale', input.locale)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('advertise_sections').upsert(
        {
          section_key: input.sectionKey,
          locale: input.locale,
          ...patch,
        },
        { onConflict: 'section_key,locale' },
      )
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: 'advertise:section:save',
      notes: `${input.sectionKey} ${input.locale}`,
    })
    revalidateLocalized('/admin/site-content')
    revalidateLocalized('/advertise')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

const SITE_SETTING_KEYS = [
  'social_facebook_url',
  'social_youtube_url',
  'site_logo_url',
  'site_name',
  'site_tagline',
  'site_name_fr',
  'site_tagline_fr',
  'announcement_text_en',
  'announcement_text_fr',
  'announcement_url',
  'feature_reading_mode',
  'feature_event_reminders',
  'feature_text_to_speech',
] as const

const SITE_SETTING_MAX_LENGTH = 500

/** Branding text keys (site name / tagline, both locales) are plain text, not URLs. */
const SITE_TEXT_KEYS = ['site_name', 'site_tagline', 'site_name_fr', 'site_tagline_fr'] as const

/** Announcement banner texts: plain text like branding, but longer (280). */
const ANNOUNCEMENT_TEXT_KEYS = ['announcement_text_en', 'announcement_text_fr'] as const

/** Feature-flag keys: only the literals 'true'/'false' are stored. */
const FEATURE_FLAG_KEYS = ['feature_reading_mode', 'feature_event_reminders', 'feature_text_to_speech'] as const

function validateFeatureFlag(value: string): string | null {
  return value === 'true' || value === 'false' ? value : null
}

function validateAnnouncementText(value: string): string | null {
  if (value.length > 280) return null
  // The banner renders this as text — reject markup outright.
  if (/[<>]/.test(value)) return null
  return value
}

function validateSiteText(value: string): string | null {
  if (value.length > 120) return null
  // Reject markup/URLs smuggled into the name — header renders this as text.
  if (/[<>]/.test(value)) return null
  return value
}

/** Validate a user-supplied public URL: absolute http(s) only — the footer
 *  renders this in an <a href>, so anything else (javascript:, data:, …) is
 *  rejected before it can reach the DOM. */
function validatePublicUrl(value: string): string | null {
  if (value.length > SITE_SETTING_MAX_LENGTH) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Validate a logo/image URL: absolute http(s) (CDN, Supabase public URL) or
 * a site-relative path (e.g. /uploads/… or an admin-asset public path).
 * Anything else (javascript:, data:, …) is rejected — the header renders
 * this in an <img>.
 */
function validateImageUrl(value: string): string | null {
  if (value.length > SITE_SETTING_MAX_LENGTH) return null
  if (value.startsWith('/')) {
    if (value.includes('..') || /[\s<>"]/.test(value)) return null
    return value
  }
  return validatePublicUrl(value)
}

/** Upsert one site setting (footer social links + site branding). An empty
 *  value deletes the row — the footer hides that icon, the header falls back
 *  to the built-in wordmark, and the defaults return. */
export async function saveSiteSetting(input: {
  key: string
  value: string | null
}): Promise<ActionResult> {
  try {
    if (!SITE_SETTING_KEYS.includes(input.key as (typeof SITE_SETTING_KEYS)[number])) {
      return { ok: false, error: 'Unknown setting.' }
    }
    const { supabase, user } = await assertCapability('manageSiteContent')
    const value = input.value?.trim() || null
    if (value) {
      let valid: string | null = null
      if ((SITE_TEXT_KEYS as readonly string[]).includes(input.key)) {
        valid = validateSiteText(value)
        if (!valid) return { ok: false, error: 'Enter plain text (max 120 characters, no markup).' }
      } else if ((ANNOUNCEMENT_TEXT_KEYS as readonly string[]).includes(input.key)) {
        valid = validateAnnouncementText(value)
        if (!valid) return { ok: false, error: 'Enter plain text (max 280 characters, no markup).' }
      } else if ((FEATURE_FLAG_KEYS as readonly string[]).includes(input.key)) {
        valid = validateFeatureFlag(value)
        if (!valid) return { ok: false, error: 'Invalid flag value.' }
      } else if (input.key === 'site_logo_url') {
        valid = validateImageUrl(value)
        if (!valid) return { ok: false, error: 'Enter a full https:// URL or a site path starting with /.' }
      } else {
        valid = validatePublicUrl(value)
        if (!valid) return { ok: false, error: 'Enter a full URL starting with https://.' }
      }
      const { error } = await supabase
        .from('site_settings')
        .upsert(
          { key: input.key, value: valid, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        )
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('site_settings').delete().eq('key', input.key)
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: 'site:setting:save',
      notes: input.key,
    })
    revalidateTag(CACHE_TAGS.site, 'max')
    revalidateLocalized('/admin/site-content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Legal inbox (takedown reports + data/contact requests)              */
/* ------------------------------------------------------------------ */

/** Resolve or dismiss a copyright report from the legal inbox. Separate from
 *  the trust & safety pipeline's `resolveReport` (status-flow + audit log):
 *  this is the simple legal-triage path with an optional resolution note. */
export async function resolveLegalReport(
  reportId: string,
  input: { resolution?: string; dismiss?: boolean },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { error } = await supabase
      .from('reports')
      .update({
        status: input.dismiss ? 'dismissed' : 'resolved',
        resolution: input.resolution?.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', reportId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: input.dismiss ? 'legal:report:dismiss' : 'legal:report:resolve',
      notes: `report=${reportId}`,
    })
    revalidateLocalized('/admin/policies')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Resolve or dismiss a data/contact request from the legal inbox. */
export async function resolveDataRequest(
  requestId: string,
  input: { resolution?: string; dismiss?: boolean },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { error } = await supabase
      .from('data_requests')
      .update({
        status: input.dismiss ? 'dismissed' : 'resolved',
        resolution: input.resolution?.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: input.dismiss ? 'legal:request:dismiss' : 'legal:request:resolve',
      notes: `data_request=${requestId}`,
    })
    revalidateLocalized('/admin/policies')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

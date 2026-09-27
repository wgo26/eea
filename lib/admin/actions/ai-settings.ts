'use server'

import { assertCapability } from '@/lib/admin/auth'
import { setAppFlag } from '@/lib/automation/flags'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCredential as storeCredential,
  isSecretStorageConfigured,
  rotateCredential as rotateCredentialRecord,
} from '@/lib/security/credential-manager'
import { AI_KEY_NAME, DEEPL_KEY_NAME, clearAiSettingsCache, getLlmRuntime, providerHostOf } from '@/lib/ai/settings'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

/**
 * Admin-UI key management for the intelligence layer (chief-only, same bar
 * as the Secrets screens: `system.owner` + the granular `secrets.*`
 * capability, audit-trailed, never logging values).
 *
 * Split on purpose: the SECRET lives in the encrypted vault
 * (`api_credentials`, AES-256-GCM); everything else (base URL, models,
 * budget, kill-switch) lives in `app_flags` (`ai.llm.*`) so tuning never
 * needs a redeploy. The transports resolve vault → env → off.
 */

async function assertChief(): Promise<void> {
  await assertCapability('system.owner')
}

import { presetById } from '@/lib/ai/providers'

function normalizeBaseUrl(raw: string): string | null {
  const v = (raw ?? '').trim().replace(/\/+$/, '')
  if (!/^https:\/\/[^/\s]+(\/\S*)?$/.test(v)) return null
  return v
}

async function probeOpenAiBase(baseUrl: string, apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'The provider rejected the key (HTTP 401/403) — check it and try again.' }
    return { ok: false, error: `The provider replied HTTP ${res.status} — the key was not validated.` }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.name === 'TimeoutError' ? 'The provider did not respond in time.' : 'Could not reach the provider.',
    }
  }
}

export type AiProviderState = {
  storageReady: boolean
  keySource: 'vault' | 'env' | 'none'
  vault: { provider: string; updatedAt: string; version: number; status: string } | null
  baseUrl: string
  model: string
  visionModel: string
  embedModel: string
  budgetTokensDay: number
  disabled: boolean
  deeplSource: 'vault' | 'env' | 'none'
}

export async function getAiProviderState(): Promise<AiProviderState | { ok: false; error: string }> {
  try {
    await assertChief()
    await assertCapability('secrets.manage')
    const rt = await getLlmRuntime()
    const { getDeeplApiKey } = await import('@/lib/ai/settings')
    const deepl = await getDeeplApiKey()
    let vault: AiProviderState['vault'] = null
    if (rt.source === 'vault') {
      const db = createAdminClient()
      const { data } = await db
        .from('api_credentials')
        .select('provider, updated_at, status, metadata')
        .eq('name', AI_KEY_NAME)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const row = data as unknown as { provider: string; updated_at: string; status: string; metadata: { version?: number } | null } | null
      if (row) vault = { provider: row.provider, updatedAt: row.updated_at, status: row.status, version: row.metadata?.version ?? 1 }
    }
    return {
      storageReady: isSecretStorageConfigured(),
      keySource: rt.source,
      vault,
      baseUrl: rt.baseUrl,
      model: rt.model,
      visionModel: rt.visionModel,
      embedModel: rt.embedModel,
      budgetTokensDay: rt.budgetTokensDay,
      disabled: rt.disabled,
      deeplSource: deepl.source,
    }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

export type SaveAiKeyInput = {
  presetId: string
  /** Required for custom; optional override for presets. */
  baseUrl?: string
  /** Optional override for the preset default. */
  model?: string
  apiKey: string
}

/**
 * Validate-then-store the LLM key: live-probes `{base}/models` FIRST so a
 * typo never lands encrypted in the vault, then creates or rotates the
 * `llm-api-key` credential and records base URL + model in flags.
 */
export async function saveAiProviderKey(input: SaveAiKeyInput): Promise<ActionResult> {
  try {
    await assertChief()
    const ctx = await assertCapability('secrets.create')
    if (!isSecretStorageConfigured()) {
      return { ok: false, error: 'Secret storage is not configured — set CREDENTIAL_ENCRYPTION_KEY first.' }
    }
    const preset = presetById(input.presetId)
    const baseUrl = normalizeBaseUrl(input.baseUrl?.trim() ? input.baseUrl : preset.baseUrl)
    if (!baseUrl) return { ok: false, error: 'The base URL must be an https URL (e.g. https://api.openai.com/v1).' }
    const model = (input.model ?? preset.model).trim().slice(0, 120) || preset.model
    const apiKey = (input.apiKey ?? '').trim()
    if (apiKey.length < 8) return { ok: false, error: 'That key looks too short — paste the full provider key.' }

    const probe = await probeOpenAiBase(baseUrl, apiKey)
    if (!probe.ok) return { ok: false, error: probe.error }

    const db = createAdminClient()
    const { data: existing } = await db
      .from('api_credentials')
      .select('id')
      .eq('name', AI_KEY_NAME)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const existingId = (existing as unknown as { id: string } | null)?.id ?? null

    if (existingId) {
      const rotated = await rotateCredentialRecord({ id: existingId, newSecret: apiKey, actorId: ctx.user.id, reason: `AI provider key update (${preset.label})` })
      if (!rotated.ok) return rotated
    } else {
      const stored = await storeCredential({
        name: AI_KEY_NAME,
        provider: preset.label,
        category: 'ai_service',
        secretValue: apiKey,
        actorId: ctx.user.id,
        notes: 'Intelligence-layer LLM key (Admin → Secrets → AI provider).',
      })
      if (!stored.ok) return stored
      await auditEvent(ctx.user.id, {
        action: 'credential.created',
        actorRole: ctx.roles.join(',') || null,
        resourceType: 'api_credential',
        resourceId: stored.id,
        metadata: { name: AI_KEY_NAME, provider: preset.label, category: 'ai_service', aiManaged: true },
      })
    }

    await setAppFlag('ai.llm.base_url', baseUrl)
    await setAppFlag('ai.llm.model', model)
    clearAiSettingsCache()
    await auditEvent(ctx.user.id, {
      action: 'ai.provider_configured',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'ai_provider',
      resourceId: AI_KEY_NAME,
      metadata: { provider: preset.label, baseUrl: providerHostOf(baseUrl), model },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized('/admin/automations')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type SaveAiSettingsInput = {
  baseUrl: string
  model: string
  visionModel?: string
  embedModel?: string
  budgetTokensDay: number
  disabled: boolean
}

/** Non-secret tuning: base URL, models, daily budget, kill-switch. */
export async function saveAiProviderSettings(input: SaveAiSettingsInput): Promise<ActionResult> {
  try {
    await assertChief()
    const ctx = await assertCapability('secrets.rotate')
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    if (!baseUrl) return { ok: false, error: 'The base URL must be an https URL.' }
    const model = input.model.trim().slice(0, 120)
    if (!model) return { ok: false, error: 'A chat model is required.' }
    const budget = Math.floor(Number(input.budgetTokensDay))
    if (!Number.isFinite(budget) || budget < 1000 || budget > 100_000_000) {
      return { ok: false, error: 'Daily budget must be between 1,000 and 100,000,000 tokens.' }
    }
    await setAppFlag('ai.llm.base_url', baseUrl)
    await setAppFlag('ai.llm.model', model)
    await setAppFlag('ai.llm.vision_model', (input.visionModel ?? '').trim().slice(0, 120) || '')
    await setAppFlag('ai.llm.embed_model', (input.embedModel ?? '').trim().slice(0, 120) || 'text-embedding-3-small')
    await setAppFlag('ai.llm.budget_tokens_day', budget)
    await setAppFlag('ai.llm.disabled', input.disabled === true)
    clearAiSettingsCache()
    await auditEvent(ctx.user.id, {
      action: 'ai.provider_settings',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'ai_provider',
      resourceId: AI_KEY_NAME,
      metadata: { baseUrl: providerHostOf(baseUrl), model, budget, disabled: input.disabled === true },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized('/admin/automations')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** DeepL key via the same vault (provider DeepL, format + live usage probe). */
export async function saveDeeplKey(apiKey: string): Promise<ActionResult> {
  try {
    await assertChief()
    const ctx = await assertCapability('secrets.create')
    if (!isSecretStorageConfigured()) {
      return { ok: false, error: 'Secret storage is not configured — set CREDENTIAL_ENCRYPTION_KEY first.' }
    }
    const key = (apiKey ?? '').trim()
    if (key.length < 8) return { ok: false, error: 'That key looks too short.' }
    const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
    try {
      const res = await fetch(`${host}/v2/usage`, {
        headers: { Authorization: `DeepL-Auth-Key ${key}` },
        signal: AbortSignal.timeout(8_000),
        cache: 'no-store',
      })
      if (res.status === 403) return { ok: false, error: 'DeepL rejected the key — check it and try again.' }
      if (!res.ok) return { ok: false, error: `DeepL replied HTTP ${res.status} — the key was not validated.` }
    } catch {
      return { ok: false, error: 'Could not reach DeepL.' }
    }
    const db = createAdminClient()
    const { data: existing } = await db
      .from('api_credentials')
      .select('id')
      .eq('name', DEEPL_KEY_NAME)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const existingId = (existing as unknown as { id: string } | null)?.id ?? null
    if (existingId) {
      const rotated = await rotateCredentialRecord({ id: existingId, newSecret: key, actorId: ctx.user.id, reason: 'DeepL key update (AI provider card)' })
      if (!rotated.ok) return rotated
    } else {
      const stored = await storeCredential({
        name: DEEPL_KEY_NAME,
        provider: 'DeepL',
        category: 'external_api',
        secretValue: key,
        actorId: ctx.user.id,
        notes: 'Translation engine key (Admin → Secrets → AI provider).',
      })
      if (!stored.ok) return stored
    }
    clearAiSettingsCache()
    await auditEvent(ctx.user.id, {
      action: 'ai.provider_configured',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'ai_provider',
      resourceId: DEEPL_KEY_NAME,
      metadata: { provider: 'DeepL' },
    })
    revalidateLocalized('/admin/secrets')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

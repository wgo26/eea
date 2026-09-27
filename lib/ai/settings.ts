import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret, isSecretStorageConfigured } from '@/lib/security/credential-manager'
import { getAppFlag } from '@/lib/automation/flags'

/**
 * P5-admin-keys — runtime AI settings resolver.
 *
 * Precedence (secret key): vault credential `llm-api-key` (active) → env
 * `LLM_API_KEY` → none. Non-secret tuning (base URL, models, budget,
 * kill-switch) lives in `app_flags` (`ai.llm.*`) → env → compiled default,
 * so everything except the key itself is editable without a redeploy.
 *
 * The vault read is cached 60s per key (module-level): cron fan-outs call
 * this per recipient-batch, not per recipient. `clearAiSettingsCache()`
 * runs after every admin save so rotation takes effect immediately.
 */

export const AI_KEY_NAME = 'llm-api-key'
export const DEEPL_KEY_NAME = 'deepl-api-key'

export type KeySource = 'vault' | 'env' | 'none'

type CacheEntry = { at: number; key: string | null }
const keyCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

export function clearAiSettingsCache(): void {
  keyCache.clear()
}

async function readVaultKey(name: string): Promise<string | null> {
  if (!isSecretStorageConfigured()) return null
  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('api_credentials')
      .select('secret_encrypted, status, updated_at')
      .eq('name', name)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const row = data as unknown as { secret_encrypted: string }
    if (!row.secret_encrypted) return null
    const secret = decryptSecret(row.secret_encrypted).trim()
    return secret || null
  } catch {
    return null
  }
}

async function getCachedVaultKey(name: string): Promise<string | null> {
  const hit = keyCache.get(name)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.key
  const key = await readVaultKey(name)
  keyCache.set(name, { at: Date.now(), key })
  return key
}

/** LLM secret: vault first, env fallback. Never throws. */
export async function getLlmApiKey(): Promise<{ key: string | null; source: KeySource }> {
  const vault = await getCachedVaultKey(AI_KEY_NAME)
  if (vault) return { key: vault, source: 'vault' }
  const env = (process.env.LLM_API_KEY ?? '').trim()
  if (env) return { key: env, source: 'env' }
  return { key: null, source: 'none' }
}

/** DeepL secret: same vault-first pattern (setup lives on the same card). */
export async function getDeeplApiKey(): Promise<{ key: string | null; source: KeySource }> {
  const vault = await getCachedVaultKey(DEEPL_KEY_NAME)
  if (vault) return { key: vault, source: 'vault' }
  const env = (process.env.DEEPL_API_KEY ?? '').trim()
  if (env) return { key: env, source: 'env' }
  return { key: null, source: 'none' }
}

async function flagOrEnv(key: string, envName: string, fallback: string): Promise<string> {
  const flag = await getAppFlag<string | null>(key, null)
  if (typeof flag === 'string' && flag.trim()) return flag.trim()
  const env = (process.env[envName] ?? '').trim()
  return env || fallback
}

export type LlmRuntime = {
  apiKey: string | null
  source: KeySource
  baseUrl: string
  model: string
  visionModel: string
  embedModel: string
  budgetTokensDay: number
  disabled: boolean
  enabled: boolean
}

/** Full runtime config for the intelligence layer (vault-aware). */
export async function getLlmRuntime(): Promise<LlmRuntime> {
  const [{ key, source }, baseUrl, model, visionModel, embedModel, budgetRaw, disabledFlag] = await Promise.all([
    getLlmApiKey(),
    flagOrEnv('ai.llm.base_url', 'LLM_BASE_URL', 'https://api.openai.com/v1'),
    flagOrEnv('ai.llm.model', 'LLM_MODEL', 'gpt-4o-mini'),
    flagOrEnv('ai.llm.vision_model', 'LLM_VISION_MODEL', ''),
    flagOrEnv('ai.llm.embed_model', 'LLM_EMBED_MODEL', 'text-embedding-3-small'),
    getAppFlag<string | number | null>('ai.llm.budget_tokens_day', null),
    getAppFlag<boolean>('ai.llm.disabled', false),
  ])
  const budgetNum = Number(budgetRaw ?? process.env.LLM_BUDGET_TOKENS_DAY ?? '200000')
  const disabled = disabledFlag === true || process.env.LLM_DISABLED === '1'
  return {
    apiKey: key,
    source,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    visionModel: visionModel || model,
    embedModel,
    budgetTokensDay: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : 200000,
    disabled,
    enabled: Boolean(key) && !disabled,
  }
}

/** Provider host for honest UI labels (vault base URL aware). */
export function providerHostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return 'unconfigured'
  }
}

/**
 * Cheap shell fact for the admin footer (no token-usage scan — the badge
 * counts live on the pages that own them). Never throws: an unreadable
 * vault/flag layer resolves to null and the row is omitted, so the footer
 * cannot become the reason a page fails.
 */
export async function getAiShellFact(): Promise<{ on: boolean; model: string; source: KeySource } | null> {
  try {
    const rt = await getLlmRuntime()
    if (!rt.apiKey) return { on: false, model: '', source: 'none' }
    return { on: rt.enabled, model: rt.model, source: rt.source }
  } catch {
    return null
  }
}

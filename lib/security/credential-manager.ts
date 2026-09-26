import 'server-only'

/**
 * Secret management core (plan Phase 2.2, spec §12–§16).
 *
 * Responsibilities are split in two layers on purpose:
 *   * this module owns the *mechanics* — encryption at rest, the credential
 *     record, the domain event log (`credential_events`) and the rotation
 *     cycle — and returns plain results, never authorization decisions;
 *   * `lib/admin/actions/credentials.ts` owns *authorization* — capability
 *     asserts, `audit_events` writes and the one-time plaintext response.
 *
 * Spec §16 requirements implemented here:
 *   * encrypted at rest — AES-256-GCM, key from `CREDENTIAL_ENCRYPTION_KEY`;
 *   * never returned unnecessarily — reads are metadata-only unless a caller
 *     explicitly asks for the plaintext (`readCredentialSecret`, used by the
 *     validation probe);
 *   * never logged — no function in this module logs or returns ciphertext
 *     (the ciphertext format is itself metadata-free and useless without the
 *     key), and callers are forbidden from putting secret values into
 *     `audit_events.metadata` (spec §19).
 *
 * Rotation model (spec §15): a credential row holds ONE active secret slot —
 * `rotateCredential` replaces the ciphertext in place and logs a `rotated`
 * event that opens a new cycle. The old secret stays valid at the provider
 * until an operator retires it, which is why the cycle's final steps
 * (`deploy`, `verify`, `retire_old`) are explicit operator confirmations: the
 * app never invalidates the previous secret on its own (spec §15, "never
 * automatically revoke the old credential before the replacement has been
 * validated unless the administrator explicitly chooses emergency
 * revocation" — emergency revocation is `revokeCredential`).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { createAdminClient, type InsertOf, type UpdateOf } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Spec §13 — what the dashboard shows in place of a secret value. */
export const SECRET_MASK = '••••••••••••••••'

/** Spec §12 credential categories. Stored in `metadata.category`. */
export const CREDENTIAL_CATEGORIES = [
  'internal_api',
  'external_api',
  'storage',
  'email',
  'analytics',
  'maps',
  'ai_service',
  'webhook',
  'oauth',
] as const
export type CredentialCategory = (typeof CREDENTIAL_CATEGORIES)[number]

export function isCredentialCategory(value: unknown): value is CredentialCategory {
  return typeof value === 'string' && (CREDENTIAL_CATEGORIES as readonly string[]).includes(value)
}

/** Mirrors the `credential_status` enum (migration 20261027000000). */
export const CREDENTIAL_STATUSES = ['active', 'disabled', 'expired', 'revoked'] as const
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number]

export function isCredentialStatus(value: unknown): value is CredentialStatus {
  return typeof value === 'string' && (CREDENTIAL_STATUSES as readonly string[]).includes(value)
}

/** The credential lifecycle log vocabulary (`credential_events.action`). */
export const CREDENTIAL_EVENT_ACTIONS = {
  created: 'created',
  rotated: 'rotated',
  validated: 'validated',
  validationFailed: 'validation_failed',
  deployed: 'deployed',
  verified: 'verified',
  oldRevoked: 'old_revoked',
  revoked: 'revoked',
  disabled: 'disabled',
  enabled: 'enabled',
  updated: 'updated',
} as const
export type CredentialEventAction =
  (typeof CREDENTIAL_EVENT_ACTIONS)[keyof typeof CREDENTIAL_EVENT_ACTIONS]

/** Spec §15 stepper order, as rendered by the credential detail page. */
export const ROTATION_STEPS = ['generate', 'validate', 'deploy', 'verify', 'retire_old'] as const
export type RotationStep = (typeof ROTATION_STEPS)[number]

export type RotationPolicy = { intervalDays: number | null }

export type CredentialRecord = {
  id: string
  name: string
  provider: string
  category: CredentialCategory | null
  status: CredentialStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  rotationPolicy: RotationPolicy
  notes: string | null
  version: number
}

export type CredentialWriteResult = { ok: true } | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Encryption at rest                                                  */
/* ------------------------------------------------------------------ */

const CIPHER_VERSION = 'v1'
const IV_BYTES = 12
const KEY_BYTES = 32

let cachedKey: Buffer | null = null

/** Accepts a 64-char hex key or a base64 key that decodes to exactly 32 bytes. */
function decodeKey(raw: string): Buffer | null {
  const value = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex')
  const buf = Buffer.from(value, 'base64')
  return buf.length === KEY_BYTES ? buf : null
}

function loadEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY is not set — secret storage is unavailable. Generate one with `openssl rand -base64 32`.',
    )
  }
  const key = decodeKey(raw)
  if (!key) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY must be 32 bytes encoded as base64 (44 chars) or hex (64 chars).',
    )
  }
  cachedKey = key
  return key
}

/** True when a usable key is configured — the secrets screens degrade on false. */
export function isSecretStorageConfigured(): boolean {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY
  return Boolean(raw && decodeKey(raw))
}

/** Cryptographically random secret value (used for "generate a new secret"). */
export function generateSecret(bytes: number = KEY_BYTES): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * `v1.<iv>.<tag>.<ciphertext>`, each segment base64url. AES-256-GCM's tag
 * makes tampering with the stored row detectable at decrypt time.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', loadEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

/** Throws on an unknown format, a wrong key, or a tampered/truncated payload. */
export function decryptSecret(payload: string): string {
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
    throw new Error('Unrecognized encrypted secret format.')
  }
  const [, ivPart, tagPart, ciphertextPart] = parts
  const decipher = createDecipheriv(
    'aes-256-gcm',
    loadEncryptionKey(),
    Buffer.from(ivPart, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/* ------------------------------------------------------------------ */
/* Record mapping                                                      */
/* ------------------------------------------------------------------ */

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function normalizeRotationPolicy(value: unknown): RotationPolicy {
  const raw = metadataOf(value).intervalDays
  const days = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null
  return { intervalDays: days }
}

/** Row → record. Never touches `secret_encrypted`; the mask is a constant. */
export function toCredentialRecord(row: Record<string, unknown>): CredentialRecord {
  const meta = metadataOf(row.metadata)
  return {
    id: row.id as string,
    name: row.name as string,
    provider: row.provider as string,
    category: isCredentialCategory(meta.category) ? meta.category : null,
    status: isCredentialStatus(row.status) ? row.status : 'active',
    createdBy: asString(row.created_by),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastUsedAt: asString(row.last_used_at),
    expiresAt: asString(row.expires_at),
    rotationPolicy: normalizeRotationPolicy(row.rotation_policy),
    notes: asString(meta.notes),
    version: typeof meta.version === 'number' && meta.version > 0 ? meta.version : 1,
  }
}

/**
 * What the operator should see: a credential whose `expires_at` has passed is
 * expired regardless of the stored status (nothing sweeps the column on a
 * schedule, so the read path is the honest place to derive it).
 */
export function effectiveCredentialStatus(
  record: Pick<CredentialRecord, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): CredentialStatus {
  if (record.status === 'active' && record.expiresAt && Date.parse(record.expiresAt) < now) {
    return 'expired'
  }
  return record.status
}

/** Spec §15 reminder: when the next rotation window opens, if a policy is set. */
export function nextRotationDueAt(record: CredentialRecord): string | null {
  const days = record.rotationPolicy.intervalDays
  if (!days) return null
  const base = Date.parse(record.updatedAt)
  if (Number.isNaN(base)) return null
  return new Date(base + days * 86_400_000).toISOString()
}

/* ------------------------------------------------------------------ */
/* Domain event log (spec §14/§55)                                     */
/* ------------------------------------------------------------------ */

export type CredentialEventInsert = {
  credentialId: string
  action: CredentialEventAction
  actorId: string
  requestId?: string
}

/**
 * Appends to `credential_events`. Deliberately takes no free-form details
 * field: the table has no such column, so a secret value cannot ride along.
 */
export async function logCredentialEvent(entry: CredentialEventInsert): Promise<void> {
  try {
    await createAdminClient()
      .from('credential_events')
      .insert({
        credential_id: entry.credentialId,
        action: entry.action,
        actor_id: entry.actorId,
        request_id: entry.requestId ?? crypto.randomUUID(),
        source: 'admin_dashboard',
      } as InsertOf<'credential_events'>)
  } catch {
    /* The lifecycle log must never break the operation it records. */
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

type Admin = ReturnType<typeof createAdminClient>

async function loadRow(admin: Admin, id: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from('api_credentials').select('*').eq('id', id).maybeSingle()
  return (data as unknown as Record<string, unknown> | null) ?? null
}

/** Metadata only — the returned record never carries the secret. */
export async function getCredentialMetadata(id: string): Promise<CredentialRecord | null> {
  const row = await loadRow(createAdminClient(), id)
  return row ? toCredentialRecord(row) : null
}

/**
 * The one plaintext read path: used by the validation probe and the
 * chief-only step-up reveal. Returns the decrypted value to its caller
 * only — callers must never log it or copy it into an audit row.
 */
export async function readCredentialSecret(
  id: string,
): Promise<{ ok: true; secret: string; record: CredentialRecord } | { ok: false; error: string }> {
  try {
    const row = await loadRow(createAdminClient(), id)
    if (!row) return { ok: false, error: 'Credential not found.' }
    return { ok: true, secret: decryptSecret(row.secret_encrypted as string), record: toCredentialRecord(row) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read the credential.' }
  }
}

/** Marks a successful real use (a live validation probe) for the usage view. */
export async function recordCredentialUse(id: string): Promise<void> {
  try {
    const now = new Date().toISOString()
    await createAdminClient()
      .from('api_credentials')
      .update({ last_used_at: now, updated_at: now } as UpdateOf<'api_credentials'>)
      .eq('id', id)
  } catch {
    /* Usage tracking is best-effort. */
  }
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function isFutureDate(value: string): boolean {
  const parsed = Date.parse(value)
  return !Number.isNaN(parsed) && parsed > Date.now()
}

export type CreateCredentialInput = {
  name: string
  provider: string
  category?: CredentialCategory | null
  secretValue: string
  actorId: string
  expiresAt?: string | null
  rotationPolicy?: RotationPolicy | null
  notes?: string | null
}

export async function createCredential(
  input: CreateCredentialInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const now = new Date().toISOString()
    const metadata: Record<string, unknown> = {
      category: input.category ?? null,
      masked: SECRET_MASK,
      version: 1,
      secretUpdatedAt: now,
      notes: input.notes?.trim() || null,
    }
    const { data, error } = await createAdminClient()
      .from('api_credentials')
      .insert({
        name: input.name,
        provider: input.provider,
        status: 'active',
        secret_encrypted: encryptSecret(input.secretValue),
        created_by: input.actorId,
        expires_at: input.expiresAt ?? null,
        rotation_policy: (input.rotationPolicy ?? { intervalDays: null }) as unknown as Json,
        metadata: metadata as unknown as Json,
      } as InsertOf<'api_credentials'>)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not store the credential.' }
    await logCredentialEvent({
      credentialId: data.id,
      action: CREDENTIAL_EVENT_ACTIONS.created,
      actorId: input.actorId,
    })
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not store the credential.' }
  }
}

export type RotateCredentialInput = {
  id: string
  newSecret: string
  actorId: string
  /** `undefined` leaves the expiry alone; `null` clears it. */
  expiresAt?: string | null
  reason?: string | null
}

/**
 * Replaces the stored secret in place and opens a new rotation cycle (spec
 * §15, "generate replacement credentials while maintaining controlled
 * transition"). The previous secret is NOT invalidated — retirement is the
 * explicit `retire_old` step, and emergency invalidation is `revokeCredential`.
 */
export async function rotateCredential(
  input: RotateCredentialInput,
): Promise<{ ok: true; version: number; record: CredentialRecord } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient()
    const row = await loadRow(admin, input.id)
    if (!row) return { ok: false, error: 'Credential not found.' }
    const record = toCredentialRecord(row)
    if (record.status === 'revoked') {
      return { ok: false, error: 'This credential is revoked — revoked is terminal. Create a new credential instead.' }
    }

    const now = new Date().toISOString()
    const meta = metadataOf(row.metadata)
    const version = record.version + 1
    const patch: UpdateOf<'api_credentials'> = {
      secret_encrypted: encryptSecret(input.newSecret),
      updated_at: now,
      metadata: {
        ...meta,
        masked: SECRET_MASK,
        version,
        secretUpdatedAt: now,
        lastRotationReason: input.reason?.trim() || null,
      } as unknown as Json,
    }
    if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt

    const { error } = await admin.from('api_credentials').update(patch).eq('id', input.id)
    if (error) return { ok: false, error: error.message }

    await logCredentialEvent({
      credentialId: input.id,
      action: CREDENTIAL_EVENT_ACTIONS.rotated,
      actorId: input.actorId,
    })
    return { ok: true, version, record: { ...record, version, updatedAt: now } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not rotate the credential.' }
  }
}

/** Spec §14 "Revoke: Immediately invalidate credentials". Terminal. */
export async function revokeCredential(input: {
  id: string
  actorId: string
  reason?: string | null
}): Promise<CredentialWriteResult> {
  try {
    const admin = createAdminClient()
    const row = await loadRow(admin, input.id)
    if (!row) return { ok: false, error: 'Credential not found.' }
    if (toCredentialRecord(row).status === 'revoked') {
      return { ok: false, error: 'This credential is already revoked.' }
    }
    const now = new Date().toISOString()
    const { error } = await admin
      .from('api_credentials')
      .update({
        status: 'revoked',
        updated_at: now,
        metadata: {
          ...metadataOf(row.metadata),
          revokedAt: now,
          revokedBy: input.actorId,
          revocationReason: input.reason?.trim() || null,
        } as unknown as Json,
      } as UpdateOf<'api_credentials'>)
      .eq('id', input.id)
    if (error) return { ok: false, error: error.message }
    await logCredentialEvent({
      credentialId: input.id,
      action: CREDENTIAL_EVENT_ACTIONS.revoked,
      actorId: input.actorId,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not revoke the credential.' }
  }
}

async function setStatus(
  id: string,
  actorId: string,
  status: 'disabled' | 'active',
  action: CredentialEventAction,
): Promise<CredentialWriteResult> {
  try {
    const admin = createAdminClient()
    const row = await loadRow(admin, id)
    if (!row) return { ok: false, error: 'Credential not found.' }
    const record = toCredentialRecord(row)
    if (record.status === 'revoked') {
      return { ok: false, error: 'This credential is revoked — revoked is terminal.' }
    }
    if (record.status === status) {
      return { ok: false, error: `This credential is already ${status === 'active' ? 'enabled' : 'disabled'}.` }
    }
    const { error } = await admin
      .from('api_credentials')
      .update({ status, updated_at: new Date().toISOString() } as UpdateOf<'api_credentials'>)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    await logCredentialEvent({ credentialId: id, action, actorId })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update the credential status.' }
  }
}

export async function disableCredential(id: string, actorId: string): Promise<CredentialWriteResult> {
  return setStatus(id, actorId, 'disabled', CREDENTIAL_EVENT_ACTIONS.disabled)
}

export async function enableCredential(id: string, actorId: string): Promise<CredentialWriteResult> {
  return setStatus(id, actorId, 'active', CREDENTIAL_EVENT_ACTIONS.enabled)
}

export type CredentialPatch = {
  name?: string
  provider?: string
  category?: CredentialCategory | null
  expiresAt?: string | null
  rotationPolicy?: RotationPolicy | null
  notes?: string | null
}

/** Spec §14 rename / expiry metadata. Never touches the secret value. */
export async function updateCredential(
  id: string,
  patch: CredentialPatch,
  actorId: string,
): Promise<CredentialWriteResult & { changed?: string[] }> {
  try {
    const admin = createAdminClient()
    const row = await loadRow(admin, id)
    if (!row) return { ok: false, error: 'Credential not found.' }

    const meta = metadataOf(row.metadata)
    const next: UpdateOf<'api_credentials'> = { updated_at: new Date().toISOString() }
    const changed: string[] = []

    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) return { ok: false, error: 'A name is required.' }
      next.name = name
      changed.push('name')
    }
    if (patch.provider !== undefined) {
      const provider = patch.provider.trim()
      if (!provider) return { ok: false, error: 'A provider is required.' }
      next.provider = provider
      changed.push('provider')
    }
    if (patch.category !== undefined) {
      meta.category = patch.category
      changed.push('category')
    }
    if (patch.expiresAt !== undefined) {
      if (patch.expiresAt !== null && Number.isNaN(Date.parse(patch.expiresAt))) {
        return { ok: false, error: 'The expiry date is not a valid date.' }
      }
      next.expires_at = patch.expiresAt
      changed.push('expiry')
    }
    if (patch.rotationPolicy !== undefined) {
      next.rotation_policy = normalizeRotationPolicy(patch.rotationPolicy) as unknown as Json
      changed.push('rotation policy')
    }
    if (patch.notes !== undefined) {
      meta.notes = patch.notes?.trim() || null
      changed.push('notes')
    }
    if (changed.length === 0) return { ok: false, error: 'Nothing to update.' }

    next.metadata = meta as unknown as Json
    const { error } = await admin.from('api_credentials').update(next).eq('id', id)
    if (error) return { ok: false, error: error.message }
    await logCredentialEvent({
      credentialId: id,
      action: CREDENTIAL_EVENT_ACTIONS.updated,
      actorId,
    })
    return { ok: true, changed }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update the credential.' }
  }
}

/** Records a validation probe outcome on the rotation cycle (spec §15). */
export async function logValidationResult(
  id: string,
  actorId: string,
  passed: boolean,
): Promise<void> {
  await logCredentialEvent({
    credentialId: id,
    action: passed ? CREDENTIAL_EVENT_ACTIONS.validated : CREDENTIAL_EVENT_ACTIONS.validationFailed,
    actorId,
  })
}

/**
 * Operator confirmation of a rotation-cycle step. `deploy` and `verify` are
 * attestations (the app cannot see the provider's configuration); `retire_old`
 * confirms the previous secret was invalidated at the provider — the point at
 * which the transition window closes.
 */
export async function markRotationStep(
  id: string,
  step: Extract<RotationStep, 'deploy' | 'verify' | 'retire_old'>,
  actorId: string,
): Promise<CredentialWriteResult> {
  const action =
    step === 'deploy'
      ? CREDENTIAL_EVENT_ACTIONS.deployed
      : step === 'verify'
        ? CREDENTIAL_EVENT_ACTIONS.verified
        : CREDENTIAL_EVENT_ACTIONS.oldRevoked
  try {
    const record = await getCredentialMetadata(id)
    if (!record) return { ok: false, error: 'Credential not found.' }
    await logCredentialEvent({ credentialId: id, action, actorId })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not record the rotation step.' }
  }
}

/* ------------------------------------------------------------------ */
/* Rotation cycle derivation (spec §15 stepper)                        */
/* ------------------------------------------------------------------ */

export type CredentialEventLike = {
  action: string
  createdAt: string | null
  actorId: string | null
}

export type RotationStepState = {
  step: RotationStep
  status: 'done' | 'failed' | 'current' | 'pending'
  at: string | null
  actorId: string | null
}

const STEP_ACTIONS: Record<RotationStep, { done: CredentialEventAction; failed?: CredentialEventAction }> = {
  generate: { done: CREDENTIAL_EVENT_ACTIONS.rotated },
  validate: {
    done: CREDENTIAL_EVENT_ACTIONS.validated,
    failed: CREDENTIAL_EVENT_ACTIONS.validationFailed,
  },
  deploy: { done: CREDENTIAL_EVENT_ACTIONS.deployed },
  verify: { done: CREDENTIAL_EVENT_ACTIONS.verified },
  retire_old: { done: CREDENTIAL_EVENT_ACTIONS.oldRevoked },
}

export type RotationCycle = {
  steps: RotationStepState[]
  /** When the current cycle opened (a `rotated`, or the original `created`). */
  startedAt: string | null
  complete: boolean
}

/**
 * Folds the credential's event log into the §15 stepper. The cycle boundary is
 * the most recent `rotated`/`created` event — everything before it belongs to
 * a previous secret. Steps are evaluated in order: a step is `current` when it
 * is the first not-yet-done step, and a failed validation marks both `failed`
 * and `current` so the operator sees where the cycle stopped.
 *
 * `version <= 1` (no rotation yet) treats `created` as the generate step, so a
 * never-rotated credential still renders a coherent one-step-done cycle.
 */
export function deriveRotationCycle(
  events: readonly CredentialEventLike[],
  version: number,
): RotationCycle {
  const chronological = [...events]
    .filter((e) => e.createdAt)
    .sort((a, b) => (a.createdAt! < b.createdAt! ? -1 : a.createdAt! > b.createdAt! ? 1 : 0))

  let startIndex = 0
  if (version <= 1) {
    const createdIndex = chronological.findIndex((e) => e.action === CREDENTIAL_EVENT_ACTIONS.created)
    startIndex = createdIndex === -1 ? 0 : createdIndex
  } else {
    for (let i = chronological.length - 1; i >= 0; i -= 1) {
      if (chronological[i].action === CREDENTIAL_EVENT_ACTIONS.rotated) {
        startIndex = i
        break
      }
    }
  }
  const cycle = chronological.slice(startIndex)
  // The event that opened the cycle coincides with the generate step: either
  // the rotation that produced this version, or the original creation.
  const opener = cycle.find(
    (e) => e.action === CREDENTIAL_EVENT_ACTIONS.rotated || e.action === CREDENTIAL_EVENT_ACTIONS.created,
  )

  let stopped = false
  const steps: RotationStepState[] = ROTATION_STEPS.map((step) => {
    const spec = STEP_ACTIONS[step]
    const done = stopped
      ? undefined
      : step === 'generate'
        ? opener
        : cycle.find((e) => e.action === spec.done)
    const failed = stopped || spec.failed === undefined ? undefined : cycle.find((e) => e.action === spec.failed)
    if (done) {
      return { step, status: 'done' as const, at: done.createdAt, actorId: done.actorId }
    }
    if (failed) {
      stopped = true
      return { step, status: 'failed' as const, at: failed.createdAt, actorId: failed.actorId }
    }
    stopped = true
    return { step, status: 'pending' as const, at: null, actorId: null }
  })

  const currentIndex = steps.findIndex((s) => s.status === 'pending' || s.status === 'failed')
  if (currentIndex !== -1) steps[currentIndex].status = 'current'

  return {
    steps,
    startedAt: cycle[0]?.createdAt ?? null,
    complete: steps.every((s) => s.status === 'done'),
  }
}

/**
 * Whether a date is in the future — exported so the actions layer validates
 * expiry input with the same rule the manager stores.
 */
export function isValidExpiry(value: string): boolean {
  return isFutureDate(value)
}

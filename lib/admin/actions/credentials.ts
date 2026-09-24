'use server'

/**
 * Secret-management server actions (plan Phase 2.2, spec §12–§16).
 *
 * Layering: `lib/security/credential-manager.ts` owns the mechanics (encryption,
 * the credential record, the `credential_events` lifecycle log); this module
 * owns authorization and the audit trail. Every export asserts a capability,
 * writes `audit_events` with `resource_type = 'api_credential'` (plan step 2.2,
 * spec §19) and revalidates the localized admin paths.
 *
 * Spec §13/§16 — the plaintext value leaves the server exactly twice: in the
 * response to the creation call and in the response to a rotation. Those two
 * results are the "shown once at creation" panel; nothing else in the app can
 * return a secret, and no audit metadata ever carries one (spec §19).
 *
 * Spec §15 rotation: `rotateCredential` only generates the replacement and
 * opens a transition window. The previous secret is never invalidated
 * automatically — `retire_old` confirms it was revoked at the provider, and
 * `revokeCredential` is the explicit emergency path. Emergency revocation is
 * gated by two-person control (spec §44) and, once a factor is enrolled, by an
 * `aal2` session.
 */

import { assertCapability, assertTwoFactorIfEnrolled } from '@/lib/admin/auth'
import {
  checkApproval,
  consumeApproval,
  isApprovalRequired,
  requestTwoPersonApproval,
} from '@/lib/admin/two-person-control'
import {
  createCredential as storeCredential,
  disableCredential as disableCredentialRecord,
  enableCredential as enableCredentialRecord,
  generateSecret,
  getCredentialMetadata,
  isCredentialCategory,
  isSecretStorageConfigured,
  isValidExpiry,
  logValidationResult,
  markRotationStep as markRotationStepRecord,
  readCredentialSecret,
  recordCredentialUse,
  revokeCredential as revokeCredentialRecord,
  rotateCredential as rotateCredentialRecord,
  updateCredential as updateCredentialRecord,
  type CredentialCategory,
  type CredentialPatch,
  type CredentialStatus,
  type RotationPolicy,
} from '@/lib/security/credential-manager'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

/** The one-time reveal payload (spec §13) — the only plaintext that leaves. */
export type SecretRevealResult =
  | { ok: true; id: string; secret: string; version: number; generated: boolean }
  | { ok: false; error: string }

export type CredentialTestResult =
  | { ok: true; live: boolean; message: string }
  | { ok: false; error: string }

export type CreateCredentialInput = {
  name: string
  provider: string
  category?: CredentialCategory | null
  secretValue: string
  expiresAt?: string | null
  rotationPolicy?: RotationPolicy | null
  notes?: string | null
}

export type RotateCredentialOptions = {
  /** Omit to have the server generate a strong random replacement. */
  newSecret?: string
  /** `undefined` keeps the stored expiry; `null` clears it. */
  expiresAt?: string | null
  reason?: string | null
}

export type RequestRevocationResult =
  | { ok: true; approvalId: string; existing: boolean }
  | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

const MIN_SECRET_LENGTH = 8

function normalizeCategory(value: CredentialCategory | null | undefined): CredentialCategory | null {
  return isCredentialCategory(value) ? value : null
}

function requireText(value: string | undefined | null, message: string): string {
  const text = value?.trim()
  if (!text) throw new Error(message)
  return text
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createCredential(input: CreateCredentialInput): Promise<SecretRevealResult> {
  try {
    const ctx = await assertCapability('secrets.create')
    if (!isSecretStorageConfigured()) {
      return { ok: false, error: 'Secret storage is not configured — set CREDENTIAL_ENCRYPTION_KEY.' }
    }
    const name = requireText(input.name, 'A name is required.')
    const provider = requireText(input.provider, 'A provider is required.')
    const secretValue = input.secretValue?.trim() ?? ''
    if (!secretValue) return { ok: false, error: 'A secret value is required.' }
    if (secretValue.length < MIN_SECRET_LENGTH) {
      return { ok: false, error: `A secret value is usually longer than ${MIN_SECRET_LENGTH} characters.` }
    }
    if (input.expiresAt && !isValidExpiry(input.expiresAt)) {
      return { ok: false, error: 'The expiry date must be in the future.' }
    }

    const stored = await storeCredential({
      name,
      provider,
      category: normalizeCategory(input.category),
      secretValue,
      actorId: ctx.user.id,
      expiresAt: input.expiresAt ?? null,
      rotationPolicy: input.rotationPolicy ?? null,
      notes: input.notes ?? null,
    })
    if (!stored.ok) return stored

    await auditEvent(ctx.user.id, {
      action: 'credential.created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: stored.id,
      metadata: {
        name,
        provider,
        category: normalizeCategory(input.category),
        version: 1,
        expiresAt: input.expiresAt ?? null,
      },
    })
    revalidateLocalized('/admin/secrets')
    return { ok: true, id: stored.id, secret: secretValue, version: 1, generated: false }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Rotate / validate                                                   */
/* ------------------------------------------------------------------ */

export async function rotateCredential(
  id: string,
  options: RotateCredentialOptions = {},
): Promise<SecretRevealResult> {
  try {
    const ctx = await assertCapability('secrets.rotate')
    if (!isSecretStorageConfigured()) {
      return { ok: false, error: 'Secret storage is not configured — set CREDENTIAL_ENCRYPTION_KEY.' }
    }
    const provided = options.newSecret?.trim()
    const generated = !provided
    const newSecret = provided || generateSecret()
    if (newSecret.length < MIN_SECRET_LENGTH) {
      return { ok: false, error: `A secret value is usually longer than ${MIN_SECRET_LENGTH} characters.` }
    }
    if (options.expiresAt && !isValidExpiry(options.expiresAt)) {
      return { ok: false, error: 'The expiry date must be in the future.' }
    }

    const result = await rotateCredentialRecord({
      id,
      newSecret,
      actorId: ctx.user.id,
      expiresAt: options.expiresAt,
      reason: options.reason ?? null,
    })
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'credential.rotated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: id,
      metadata: {
        version: result.version,
        generated,
        reason: options.reason?.trim() || null,
        expiresAt: options.expiresAt === undefined ? 'unchanged' : options.expiresAt,
      },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized(`/admin/secrets/${id}`)
    return { ok: true, id, secret: newSecret, version: result.version, generated }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Live validation probe (spec §15 "Validate")                         */
/* ------------------------------------------------------------------ */

const PROBE_TIMEOUT_MS = 8_000

type ProbeOutcome = { passed: boolean; live: boolean; message: string }

/**
 * A live probe only when the provider authenticates with a plain header —
 * a secret must never ride in a URL (spec §16) and an unrecognized provider
 * gets a format check with an honest `live: false` report rather than a
 * fabricated verdict.
 */
async function probeCredential(
  provider: string,
  secret: string,
): Promise<ProbeOutcome> {
  const key = provider.trim().toLowerCase()
  const url = probeUrl(key, secret)
  if (!url) {
    if (/\s/.test(secret)) {
      return { passed: false, live: false, message: 'The stored value contains whitespace.' }
    }
    return {
      passed: secret.length >= MIN_SECRET_LENGTH,
      live: false,
      message: `No live probe is available for “${provider}” — the value is encrypted at rest and only its format was checked.`,
    }
  }
  try {
    const res = await fetch(url.href, {
      method: 'GET',
      headers: url.headers,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (res.ok) {
      return { passed: true, live: true, message: `${provider} accepted the credential.` }
    }
    return {
      passed: false,
      live: true,
      message: `${provider} rejected the credential (HTTP ${res.status}).`,
    }
  } catch (e) {
    return {
      passed: false,
      live: true,
      message: e instanceof Error && e.name === 'TimeoutError'
        ? `${provider} did not respond in time.`
        : `Could not reach ${provider}.`,
    }
  }
}

function probeUrl(
  provider: string,
  secret: string,
): { href: string; headers: Record<string, string> } | null {
  if (provider.includes('deepl')) {
    // Free-tier keys end in `:fx` and live on the free host (lib/translate/deepl.ts).
    const host = secret.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
    return { href: `${host}/v2/usage`, headers: { Authorization: `DeepL-Auth-Key ${secret}` } }
  }
  if (provider.includes('meta') || provider.includes('facebook') || provider.includes('whatsapp')) {
    return {
      href: 'https://graph.facebook.com/v21.0/me',
      headers: { Authorization: `Bearer ${secret}` },
    }
  }
  return null
}

export async function testCredential(id: string): Promise<CredentialTestResult> {
  try {
    const ctx = await assertCapability('secrets.rotate')
    const read = await readCredentialSecret(id)
    if (!read.ok) return { ok: false, error: read.error }

    const outcome = await probeCredential(read.record.provider, read.secret)
    await logValidationResult(id, ctx.user.id, outcome.passed)
    if (outcome.passed && outcome.live) await recordCredentialUse(id)

    await auditEvent(ctx.user.id, {
      action: 'credential.validated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: id,
      metadata: { passed: outcome.passed, live: outcome.live, provider: read.record.provider },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized(`/admin/secrets/${id}`)
    return outcome.passed
      ? { ok: true, live: outcome.live, message: outcome.message }
      : { ok: false, error: outcome.message }
  } catch (e) {
    return fail(e)
  }
}

/** Operator attestation of a rotation step (deploy / verify / retire old). */
export async function markRotationStep(
  id: string,
  step: 'deploy' | 'verify' | 'retire_old',
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('secrets.rotate')
    const result = await markRotationStepRecord(id, step, ctx.user.id)
    if (!result.ok) return result
    await auditEvent(ctx.user.id, {
      action: `credential.rotation_${step}`,
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: id,
      metadata: { step },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized(`/admin/secrets/${id}`)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Revocation (two-person controlled, spec §44)                        */
/* ------------------------------------------------------------------ */

/**
 * Step 1 of the §44 flow: the acting admin asks for a second signature. The
 * capability check is the same one the revocation itself makes, so a request
 * never becomes a way to route around authorization. `assertTwoFactorIfEnrolled`
 * applies here too — raising the request is the privileged act.
 */
export async function requestCredentialRevocation(
  id: string,
  reason?: string,
): Promise<RequestRevocationResult> {
  try {
    const ctx = await assertTwoFactorIfEnrolled(await assertCapability('secrets.revoke'))
    const record = await getCredentialMetadata(id)
    if (!record) return { ok: false, error: 'Credential not found.' }
    if (record.status === 'revoked') return { ok: false, error: 'This credential is already revoked.' }

    const approval = await requestTwoPersonApproval({
      action: 'secret.revoke',
      actorId: ctx.user.id,
      resourceType: 'api_credential',
      resourceId: id,
      reason: reason ?? null,
    })
    if (!approval.ok) return approval

    if (!approval.existing) {
      await auditEvent(ctx.user.id, {
        action: 'approval.requested',
        actorRole: ctx.roles.join(',') || null,
        resourceType: 'api_credential',
        resourceId: id,
        metadata: {
          approvalId: approval.id,
          requestedAction: 'secret.revoke',
          reason: reason?.trim() || null,
          expiresAt: approval.expiresAt,
        },
      })
    }
    revalidateLocalized('/admin/approvals')
    revalidateLocalized(`/admin/secrets/${id}`)
    return { ok: true, approvalId: approval.id, existing: approval.existing }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Step 3 of the §44 flow: perform the revocation with an approved request.
 * `checkApproval` is read-only and runs BEFORE the operation; `consumeApproval`
 * runs only after it succeeds, so a failed attempt leaves the approval usable
 * and an approval can never authorize twice.
 *
 * `isApprovalRequired` is the single policy seam — an organization that wants
 * to make two-person control configurable (spec §44, "configurable by
 * organization policy") changes that predicate, not this action.
 */
export async function revokeCredential(
  id: string,
  options: { approvalId?: string | null; reason?: string | null } = {},
): Promise<ActionResult> {
  try {
    const ctx = await assertTwoFactorIfEnrolled(await assertCapability('secrets.revoke'))
    const approvalId = options.approvalId?.trim() || null
    if (isApprovalRequired('secret.revoke')) {
      if (!approvalId) {
        return {
          ok: false,
          error: 'Revoking a credential needs a second administrator’s approval — request one first.',
        }
      }
      const verdict = await checkApproval({
        approvalId,
        action: 'secret.revoke',
        actorId: ctx.user.id,
        resourceType: 'api_credential',
        resourceId: id,
      })
      if (!verdict.ok) return verdict
    }

    const record = await getCredentialMetadata(id)
    const result = await revokeCredentialRecord({
      id,
      actorId: ctx.user.id,
      reason: options.reason ?? null,
    })
    if (!result.ok) return result
    if (approvalId) await consumeApproval(approvalId)

    await auditEvent(ctx.user.id, {
      action: 'credential.revoked',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: id,
      metadata: {
        reason: options.reason?.trim() || null,
        approvalId,
        provider: record?.provider ?? null,
        name: record?.name ?? null,
      },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized(`/admin/secrets/${id}`)
    revalidateLocalized('/admin/approvals')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Lifecycle status + metadata                                         */
/* ------------------------------------------------------------------ */

export async function disableCredential(id: string): Promise<ActionResult> {
  return setStatusAction(id, 'disabled')
}

export async function enableCredential(id: string): Promise<ActionResult> {
  return setStatusAction(id, 'active')
}

async function setStatusAction(id: string, status: Extract<CredentialStatus, 'active' | 'disabled'>): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('secrets.manage')
    const result =
      status === 'disabled'
        ? await disableCredentialRecord(id, ctx.user.id)
        : await enableCredentialRecord(id, ctx.user.id)
    if (!result.ok) return result
    await auditEvent(ctx.user.id, {
      action: `credential.${status === 'disabled' ? 'disabled' : 'enabled'}`,
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: id,
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized(`/admin/secrets/${id}`)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateCredential(
  id: string,
  patch: CredentialPatch,
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('secrets.manage')
    const result = await updateCredentialRecord(id, patch, ctx.user.id)
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'credential.updated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'api_credential',
      resourceId: id,
      metadata: { fields: result.changed ?? [] },
    })
    revalidateLocalized('/admin/secrets')
    revalidateLocalized(`/admin/secrets/${id}`)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

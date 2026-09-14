'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath, safeNextPath } from '@/lib/i18n/urls'

export type MfaFactor = { id: string; friendlyName: string | null; createdAt: string }

/**
 * Two-factor authentication (TOTP) on Supabase Auth MFA.
 * Enroll: enroll → scan QR / save key → verify code (activates).
 * Log in: password → assurance check → challenge page → verify → landing.
 * Sessions at aal1 can manage factors but nothing else privileged.
 */

export async function getMfaFactors(): Promise<MfaFactor[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return []
  return (data.totp ?? []).map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? null,
    createdAt: f.created_at,
  }))
}

export async function enrollMfa(): Promise<
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not start enrollment.' }
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyMfaEnrollment(factorId: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const clean = code.replace(/\D/g, '')
  if (clean.length !== 6) return { ok: false, error: 'Enter the 6-digit code.' }
  const challenge = await supabase.auth.mfa.challenge({ factorId })
  if (challenge.error) return { ok: false, error: challenge.error.message }
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: clean })
  if (error) return { ok: false, error: 'That code did not work. Try the current one.' }
  return { ok: true }
}

export async function unenrollMfa(factorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Assurance level after password sign-in — 'aal2' means "go verify a code". */
export async function needsMfaChallenge(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
}

export async function verifyMfaChallenge(
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const code = String(formData.get('code') ?? '').replace(/\D/g, '')
  const next = typeof formData.get('next') === 'string' ? (formData.get('next') as string) : null
  if (code.length !== 6) return { ok: false, error: 'invalid' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'session' }
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = (factors?.totp ?? []).find((f) => f.status === 'verified') ?? (factors?.totp ?? [])[0]
  if (!factor) return { ok: false, error: 'none' }
  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id })
  if (challenge.error) return { ok: false, error: 'generic' }
  const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code })
  if (error) return { ok: false, error: 'invalid' }
  const locale = await getRequestLocale()
  const dest = safeNextPath(next, locale) ?? localePath(locale, '/auth/landing')
  redirect(dest)
}

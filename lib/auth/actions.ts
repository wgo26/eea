'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath, safeNextPath } from '@/lib/i18n/urls'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { verifyTurnstileToken } from '@/lib/security/turnstile'
import { SITE } from '@/lib/constants'

/**
 * Signs the user out and lands them on the localized homepage.
 * Used by the AppShell topbars (admin + account) — the profile area lives in
 * the shell so sign-out is reachable from every app page (checklist item 11).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const locale = await getRequestLocale()
  redirect(localePath(locale, '/'))
}

/* ------------------------------------------------------------------ */
/* Email + password auth (login / signup)                              */
/* ------------------------------------------------------------------ */

/**
 * Shared shape for the auth form actions. `error` is a stable code — the
 * client maps it to a localized dictionary string, so raw Supabase
 * (English-only, sometimes user-enumerating) messages never reach the UI.
 */
export type AuthErrorCode =
  | 'invalid'
  | 'invalid_credentials'
  | 'not_confirmed'
  | 'email_exists'
  | 'rate_limited'
  | 'captcha'
  | 'account_disabled'
  | 'provider_error'

export type AuthState = {
  ok: boolean
  error?: AuthErrorCode
  /** Signup when email confirmation is on: session is null, show check-email. */
  checkEmail?: boolean
  email?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function str(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  return email.length >= 3 && email.length <= 254 && EMAIL_RE.test(email)
}

/** Supabase (English) error → stable code. Never surfaced to the UI. */
function mapSupabaseError(message: string): AuthErrorCode {
  const msg = message.toLowerCase()
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'invalid_credentials'
  }
  if (msg.includes('email not confirmed')) return 'not_confirmed'
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
    return 'email_exists'
  }
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('over request rate')) {
    return 'rate_limited'
  }
  return 'provider_error'
}

/** Validated `next` → the role-aware landing URL that honors it. When no
 * explicit `next` was requested, omit the param so /auth/landing falls back
 * to the role landing (staff → /admin/dashboard, else /account/dashboard)
 * instead of masking the role with a hardcoded member default. */
async function landingFor(rawNext: string | null): Promise<string> {
  const locale = await getRequestLocale()
  const nextPath = safeNextPath(rawNext, locale)
  if (!nextPath) return localePath(locale, '/auth/landing')
  return localePath(locale, `/auth/landing?next=${encodeURIComponent(nextPath)}`)
}

/**
 * Email + password sign-in. Session cookies are set server-side (no
 * client/server race), then we redirect into the role-aware landing which
 * honors a validated `next` or falls back to the role landing.
 */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(str(formData.get('email')))
  const password = typeof formData.get('password') === 'string'
    ? (formData.get('password') as string)
    : ''

  if (!isValidEmail(email) || password.length < 1 || password.length > 256) {
    return { ok: false, error: 'invalid' }
  }

  // Abuse gate (durable per-IP limiter + Turnstile when configured) — brute
  // force is also throttled by Supabase's own auth rate limits.
  const limited = await checkRateLimit('auth:login', { max: 10, windowMs: 10 * 60_000 })
  if (!limited.ok) return { ok: false, error: 'rate_limited' }
  const turnstileToken = formData.get('cf-turnstile-response')
  if (!(await verifyTurnstileToken(typeof turnstileToken === 'string' ? turnstileToken : null))) {
    return { ok: false, error: 'captcha' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: mapSupabaseError(error.message) }

  const { data: profile } = await supabase.from('profiles').select('is_suspended, is_banned').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single()
  if (profile?.is_suspended || profile?.is_banned) {
    await supabase.auth.signOut()
    return { ok: false, error: 'account_disabled' }
  }

  redirect(await landingFor(str(formData.get('next')) || null))
}

/**
 * Email + password sign-up. The `handle_new_user` DB trigger owns profile +
 * default-role creation, so this action only passes the display name as auth
 * metadata (which the trigger reads) and never writes to `profiles` itself.
 * The confirmation link is built from the trusted server site URL.
 */
export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const fullName = str(formData.get('fullName'))
  const email = normalizeEmail(str(formData.get('email')))
  const password = typeof formData.get('password') === 'string'
    ? (formData.get('password') as string)
    : ''

  if (
    fullName.length < 2 ||
    fullName.length > 80 ||
    !isValidEmail(email) ||
    password.length < 8 ||
    password.length > 72
  ) {
    return { ok: false, error: 'invalid' }
  }

  // Abuse gate: durable per-IP limiter + Turnstile when configured. Signup
  // floods also burn Supabase SMTP quota, so this gate runs before signUp().
  const limited = await checkRateLimit('auth:signup', { max: 5, windowMs: 60 * 60_000 })
  if (!limited.ok) return { ok: false, error: 'rate_limited' }
  const turnstileToken = formData.get('cf-turnstile-response')
  if (!(await verifyTurnstileToken(typeof turnstileToken === 'string' ? turnstileToken : null))) {
    return { ok: false, error: 'captcha' }
  }

  const locale = await getRequestLocale()
  const explicitNext = safeNextPath(str(formData.get('next')) || null, locale)
  const loginHere =
    `/${locale}/account/login` +
    (explicitNext ? `?next=${encodeURIComponent(explicitNext)}` : '')
  const siteUrl = SITE.url.replace(/\/+$/, '')
  const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(loginHere)}`

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: fullName, full_name: fullName },
      emailRedirectTo,
    },
  })
  if (error) return { ok: false, error: mapSupabaseError(error.message) }

  // Confirmation-on projects return a user with no session: show check-email.
  // Supabase also returns an empty `identities` array when the address is
  // already registered — surface the helpful "try logging in" message.
  if (!data.session) {
    if ((data.user?.identities?.length ?? 1) === 0) {
      return { ok: false, error: 'email_exists' }
    }
    return { ok: true, checkEmail: true, email }
  }

  redirect(await landingFor(str(formData.get('next')) || null))
}

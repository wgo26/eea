/**
 * OAuth provider configuration shared by Server Components and Server Actions.
 *
 * Deliberately NOT a `'use server'` module. `lib/auth/actions.ts` carries the
 * module-level `'use server'` directive, which makes *every* export in that
 * file a Server Action — and Next.js requires Server Actions to be async
 * functions. `enabledOAuthProviders()` is a synchronous env read performed
 * during render, so it cannot live there: the build fails with
 * "Server Actions must be async functions". `scripts/verify-server-actions.mjs`
 * (wired into `npm run check`) guards this invariant for every such file.
 *
 * Providers must ALSO be enabled in the Supabase dashboard
 * (Authentication → Providers) with this app's `/auth/callback` URL
 * allow-listed — env-gating here only controls whether the buttons render, so
 * an unconfigured dashboard never shows a dead button.
 * Set NEXT_PUBLIC_OAUTH_PROVIDERS=google to enable.
 */

/** Providers this app can render sign-in buttons for. */
export const OAUTH_PROVIDERS = ['google'] as const

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

/** The allow-listed providers whose env flag is actually set. */
export function enabledOAuthProviders(): OAuthProvider[] {
  const raw = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? '').toLowerCase()
  return OAUTH_PROVIDERS.filter((p) => raw.split(/[,\s]+/).includes(p))
}
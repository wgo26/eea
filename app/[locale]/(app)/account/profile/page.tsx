import Link from 'next/link'
import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath } from '@/lib/i18n/urls'
import { requireUser } from '@/lib/auth/guards'
import { ProfileForm, type ProfileInitial } from '@/components/account/profile-form'

export async function generateMetadata() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  return { title: dict.account.profile.title }
}

export default async function Page() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.account.profile
  const { supabase, user } = await requireUser('/account/profile')

  const [{ data: profile }, { data: locations }, { data: rolesRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'display_name, full_name, bio, phone, email, avatar_url, location_id, is_verified, is_public, preferred_locale, preferred_voice, contributor_handle',
      )
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('locations').select('id, name').eq('is_active', true).order('name', { ascending: true }).limit(300),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ])

  const p = profile as {
    display_name?: string | null
    full_name?: string | null
    bio?: string | null
    phone?: string | null
    email?: string | null
    avatar_url?: string | null
    location_id?: string | null
    is_verified?: boolean | null
    is_public?: boolean | null
    preferred_locale?: string | null
    preferred_voice?: string | null
    contributor_handle?: string | null
  } | null

  const initial: ProfileInitial = {
    displayName: p?.display_name ?? '',
    fullName: p?.full_name ?? '',
    bio: p?.bio ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? user.email ?? '',
    avatarUrl: p?.avatar_url ?? '',
    locationId: p?.location_id ?? '',
    isPublic: p?.is_public ?? true,
    isVerified: !!p?.is_verified,
    preferredLocale: p?.preferred_locale ?? locale,
    preferredVoice: p?.preferred_voice ?? 'formal',
    contributorHandle: p?.contributor_handle ?? '',
  }

  const roles = (rolesRows ?? []).map((r: { role?: string }) => r.role).filter(Boolean) as string[]

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6 lg:py-12">
      <header className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.title}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{initial.displayName || initial.fullName || initial.email}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {roles.length > 0 ? (
            roles.map((r) => (
              <span key={r} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {r}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {t.memberRole}
            </span>
          )}
          {(p?.is_public ?? true) && (
            <Link
              href={localePath(locale, `/contributors/${user.id}`)}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:underline"
            >
              {t.viewPublic} →
            </Link>
          )}
        </div>
      </header>

      <ProfileForm copy={t} initial={initial} locations={(locations ?? []) as { id: string; name: string }[]} />
    </div>
  )
}

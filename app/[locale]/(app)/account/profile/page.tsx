import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { accountPageBreadcrumb } from "@/lib/account/nav";
import { AccountBadge, AccountPageShell } from "@/components/account/account-page-shell";
import { ProfileForm, type ProfileInitial } from "@/components/account/profile-form";

export async function generateMetadata() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  return { title: dict.account.profile.title }
}

export default async function Page() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.account.profile
  const { supabase, user } = await requireUser("/account/profile")

  const [{ data: profile }, { data: locations }, { data: rolesRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, full_name, bio, phone, email, avatar_url, location_id, is_verified, is_public, preferred_locale, preferred_voice, contributor_handle",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("locations").select("id, name").eq("is_active", true).order("name", { ascending: true }).limit(300),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
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
    displayName: p?.display_name ?? "",
    fullName: p?.full_name ?? "",
    bio: p?.bio ?? "",
    phone: p?.phone ?? "",
    email: p?.email ?? user.email ?? "",
    avatarUrl: p?.avatar_url ?? "",
    locationId: p?.location_id ?? "",
    isPublic: p?.is_public ?? true,
    isVerified: !!p?.is_verified,
    preferredLocale: p?.preferred_locale ?? locale,
    preferredVoice: p?.preferred_voice ?? "formal",
    contributorHandle: p?.contributor_handle ?? "",
  }

  const roles = (rolesRows ?? []).map((r: { role?: string }) => r.role).filter(Boolean) as string[]

  return (
    <AccountPageShell
      title={t.title}
      description={t.description}
      size="narrow"
      breadcrumb={accountPageBreadcrumb(locale, "/account/profile")}
      actions={
        <>
          {roles.map((role) => (
            <AccountBadge key={role}>{role}</AccountBadge>
          ))}
          {roles.length === 0 ? <AccountBadge>{t.memberRole}</AccountBadge> : null}
          {initial.isPublic ? (
            <Link
              href={localePath(locale, `/contributors/${user.id}`)}
              className="inline-flex h-9 items-center rounded-md bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {t.viewPublic} →
            </Link>
          ) : null}
        </>
      }
    >
      <ProfileForm copy={t} initial={initial} locations={(locations ?? []) as { id: string; name: string }[]} />
    </AccountPageShell>
  )
}

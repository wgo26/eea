import Link from "next/link";
import { BadgeCheck, CalendarDays, MapPin, Pencil } from "lucide-react";
import Image from "next/image";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { localePath } from "@/lib/i18n/urls";
import type { AccountIdentity } from "@/lib/account/identity";
import { AccountBadge, AccountCard } from "./account-page-shell";

/**
 * Member identity banner (Account audit §3 Phase 2). The dashboard had four
 * near-identical hero cards (member / contributor / advertiser / staff) that
 * printed a name plus role pills. This is the one component they all use:
 * avatar, display name, what the account can do, then the facts that make the
 * page feel like yours — verification, city, joined date.
 */
export function MemberBanner({
  locale,
  identity,
  kicker,
  subtitle,
  profileTab,
}: {
  locale: Locale;
  identity: AccountIdentity;
  kicker: string;
  subtitle: string;
  /** Which Profile tab the "Edit profile" tap should open. */
  profileTab?: "identity" | "contact" | "preferences";
}) {
  const dict = getDictionary(locale);
  const t = dict.account.dashboard;
  const profileBase = localePath(locale, "/account/profile");
  const editHref = profileTab ? `${profileBase}?tab=${profileTab}` : profileBase;

  return (
    <AccountCard
      action={
        <Link
          href={editHref}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {t.editProfile}
        </Link>
      }
    >
      <div className="flex flex-wrap items-start gap-4">
        {identity.avatarUrl ? (
          <Image
            src={identity.avatarUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full bg-muted object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {identity.initials || "—"}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
          <h1 className="mt-1.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {identity.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AccountBadge tone="primary">{identity.roleLabel}</AccountBadge>
            {identity.isVerified ? (
              <AccountBadge tone="success">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                {dict.account.profile.verifiedYes}
              </AccountBadge>
            ) : null}
            {identity.locationName ? (
              <AccountBadge>
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {identity.locationName}
              </AccountBadge>
            ) : null}
            {identity.joinedLabel ? (
              <AccountBadge>
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {identity.joinedLabel}
              </AccountBadge>
            ) : null}
          </div>
        </div>
      </div>
    </AccountCard>
  );
}
import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { safeNextPath, localePath } from "@/lib/i18n/urls";
import { requireUser } from "@/lib/auth/guards";
import { getUserRoles, isStaffRoles } from "@/lib/auth/roles";
import { AuthLandingClient } from "./auth-landing-client";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    return {
        title: getDictionary(locale).auth.landing.welcome,
        robots: { index: false, follow: false },
    };
}

/**
 * Post-auth landing (checklist item 4). Destination precedence:
 *   1. a validated `next` (same-origin absolute path, re-prefixed with the
 *      active locale) — the page the user was actually trying to reach;
 *   2. the role landing: staff → admin dashboard, everyone else → the
 *      account dashboard. A zero-role authenticated user is a "member"
 *      (documented model) and gets the member dashboard.
 */
export default async function Page({ searchParams }: Props) {
    const locale = await getRequestLocale();
    const { next: rawNext } = await searchParams;
    const nextParam = Array.isArray(rawNext) ? rawNext[0] : rawNext;

    const { supabase, user } = await requireUser("/auth/landing");
    const roles = await getUserRoles(supabase, user.id);
    const roleLanding = isStaffRoles(roles)
        ? "/admin/dashboard"
        : "/account/dashboard";

    const destination =
        safeNextPath(nextParam, locale) ?? localePath(locale, roleLanding);

    const dict = getDictionary(locale);
    return (
        <AuthLandingClient
            destination={destination}
            copy={dict.auth.landing}
        />
    );
}

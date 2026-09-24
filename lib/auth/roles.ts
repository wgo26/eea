import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "./types";
import { isAdminRole, type AdminRole } from "./admin-roles";

export type { AppRole };
export type Role = AppRole;

export const ROLES: AppRole[] = ["admin", "editor", "contributor", "advertiser"];

export const STAFF_ROLES: AppRole[] = ["admin", "editor"];
export const ADMIN_ROLES: AppRole[] = ["admin"];

/**
 * Submission lifecycle statuses. Mirrors the `submission_status` DB enum
 * (init schema §1) so queue filters stay type-safe end to end.
 */
export type SubmissionStatus =
  | "pending"
  | "automated_checks"
  | "editorial_review"
  | "escalated"
  | "in_review"
  | "approved"
  | "scheduled"
  | "rejected"
  | "needs_clarification"
  | "published"
  | "withdrawn";

export type ContentType =
  | "photo_story"
  | "news"
  | "listing"
  | "notice"
  | "culture"
  | "micro_story";

export type VerificationStatus =
  | "verified"
  | "community_submission"
  | "official_source"
  | "developing";

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  photo_story: "Photo Stories",
  news: "Community News",
  listing: "Buy & Sell",
  notice: "Notices",
  culture: "Culture & Entertainment",
  // Phase 4 — Eye on the Street micro-format (Differentiator #8).
  micro_story: "Eye on the Street",
};

export function isRole(value: string | undefined | null): value is AppRole {
  return !!value && (ROLES as string[]).includes(value);
}

export function isStaffRoles(roles: AppRole[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

export function isAdminRoles(roles: AppRole[]): boolean {
  return roles.includes("admin");
}

/**
 * Fetches the user's roles from the `user_roles` table.
 * Used by lib/auth/guards.ts (requireRole / requireStaff / requireAdmin).
 */
export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    // Never silently swallow: a denied/granted read here turns every staff
    // member into a "member" (all /admin pages deny). Log so the cause is
    // visible in production logs instead of masquerading as "access denied".
    // This module is also imported client-side (auth-provider), so the
    // server-only structured logger is unavailable — emit the same JSON
    // record shape (lib/observability/logger.ts) inline instead.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        scope: 'auth',
        message: 'getUserRoles failed, treating as no roles',
        error: { message: error.message },
      }),
    );
    return [];
  }
  return (data ?? [])
    .map((row: { role: string }) => row.role)
    .filter(isRole);
}

/**
 * Phase 2.1 (spec §17) — the fine-grained admin roles from `user_admin_roles`
 * (see lib/auth/admin-roles.ts). The coarse `user_roles` enum above decides
 * whether someone is staff; these decide what they may do inside the admin
 * area.
 *
 * Reads are RLS-scoped ("Admins read admin roles" / "Users read own admin
 * roles"), so the cookie-scoped client works for both self-checks and the
 * users admin screen — no service-role escalation just to render a badge.
 * Expired grants (`expires_at` in the past) are ignored, matching the
 * migration's contract.
 */
export async function getAdminRoles(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminRole[]> {
  const { data, error } = await supabase
    .from("user_admin_roles")
    .select("role, expires_at")
    .eq("user_id", userId);

  if (error) {
    // Same contract as getUserRoles: log the real cause (a denied read would
    // otherwise masquerade as "no admin roles") and degrade to no roles.
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        scope: 'auth',
        message: 'getAdminRoles failed, treating as no admin roles',
        error: { message: error.message },
      }),
    );
    return [];
  }
  const now = Date.now();
  return (data ?? [])
    .filter((row: { expires_at: string | null }) => !row.expires_at || Date.parse(row.expires_at) > now)
    .map((row: { role: string }) => row.role)
    .filter(isAdminRole);
}

/** True when the user's admin roles include any of the required role(s). */
export function hasAdminRole(adminRoles: AdminRole[], role: AdminRole | AdminRole[]): boolean {
  const required = Array.isArray(role) ? role : [role];
  return required.some((r) => adminRoles.includes(r));
}
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "./types";

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
  | "in_review"
  | "approved"
  | "rejected"
  | "needs_clarification"
  | "published"
  | "withdrawn";

export type ContentType =
  | "photo_story"
  | "news"
  | "listing"
  | "notice"
  | "culture";

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

  if (error) return [];
  return (data ?? [])
    .map((row: { role: string }) => row.role)
    .filter(isRole);
}
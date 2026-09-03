import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "./roles";

export type SessionUser = {
  id: string;
  email?: string;
  role: Role | null;
  displayName: string | null;
};

/**
 * Returns the current user (or null). Cached per request so multiple
 * server components can call it without extra round-trips.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = isRole(user.app_metadata?.role) ? user.app_metadata.role : null;

  return {
    id: user.id,
    email: user.email,
    role,
    displayName:
      (user.user_metadata?.display_name as string | undefined) ?? null,
  };
});

/** True for admin/editor — gates /admin routes and moderation actions. */
export async function isEditorialUser(): Promise<boolean> {
  const user = await getSessionUser();
  return user?.role === "admin" || user?.role === "editor";
}
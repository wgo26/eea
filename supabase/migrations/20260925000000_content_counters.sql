-- Per-content view/share counters (public social proof + admin insights).
--
-- `content_items.view_count` / `share_count` already exist but were never
-- incremented by the app. These RPCs give the API routes an atomic bump
-- without a read-modify-write race. Privacy contract: counters only — no
-- IP, UA, user id, or path is stored here (same aggregate-only posture as
-- `analytics_daily`). Service-role only; the API routes call them with the
-- admin client after validation + rate limiting.

create or replace function public.content_view_bump(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.content_items
     set view_count = view_count + 1,
         updated_at = now()
   where id = p_id;
$$;

create or replace function public.content_share_bump(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.content_items
     set share_count = share_count + 1,
         updated_at = now()
   where id = p_id;
$$;

revoke all on function public.content_view_bump(uuid) from public, anon, authenticated;
revoke all on function public.content_share_bump(uuid) from public, anon, authenticated;
grant execute on function public.content_view_bump(uuid) to service_role;
grant execute on function public.content_share_bump(uuid) to service_role;

comment on function public.content_view_bump(uuid) is
  'Atomic per-content view counter increment. Service-role only; called by POST /api/content/[id]/view.';
comment on function public.content_share_bump(uuid) is
  'Atomic per-content share counter increment. Service-role only; called by POST /api/content/[id]/share.';

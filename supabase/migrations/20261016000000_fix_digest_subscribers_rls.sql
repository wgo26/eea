-- Phase 0 (P0): close the digest_subscribers PII leak.
--
-- The init schema granted `FOR ALL USING (true) WITH CHECK (true)`, so any
-- anonymous PostgREST caller could SELECT/UPDATE/DELETE every subscriber email.
-- Public subscribe/unsubscribe flows use the service-role client
-- (lib/notify/actions.ts subscribeDigest/unsubscribeDigest) and the nightly
-- fan-out runs service-role (app/api/cron/ops-digest), so RLS can deny
-- anonymous/authenticated access entirely. Staff manage via their session
-- client (lib/notify/actions.ts toggleDigestSubscriber behind
-- manageNotifications), which needs an explicit staff policy.
--
-- Idempotent: safe to re-run via `supabase db push` or the dashboard.

alter table public.digest_subscribers enable row level security;

drop policy if exists "Own digest subscription" on public.digest_subscribers;

-- No public read/write: anon and plain authenticated callers get nothing.
-- (No policy = deny under RLS.)

-- Staff (admin + editor) manage the list from /admin/notifications.
drop policy if exists "Staff manage digest subscribers" on public.digest_subscribers;
create policy "Staff manage digest subscribers"
    on public.digest_subscribers for all
    using (public.is_staff()) with check (public.is_staff());

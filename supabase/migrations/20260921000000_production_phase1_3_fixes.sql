-- Migration: 20260921000000_production_phase1_3_fixes.sql
-- Description: Production hardening follow-up for audit Phases 1-3.
--
-- Problems fixed:
--   1. public.public_profiles exposed full_name (tighten to the audit's safe
--      column set: id, display_name, avatar_url, bio, created_at).
--   2. Direct PostgREST reads could pull contact PII columns even though the
--      app layer now gates them (listings/notices contact columns, profiles
--      email/phone, fundraiser/event organizer contacts). Column-level REVOKEs
--      below close that bypass. All server code uses the service_role client,
--      which is unaffected by these revokes.
--   3. Anonymous INSERT RLS policies used WITH CHECK (true), so a forgotten
--      app-level check meant unconstrained writes. They now validate payload
--      shape at the database engine level (audit §2.1 remediation).
--   4. "Own data requests" SELECT policy let any anonymous caller read every
--      row with a non-null requester_email (PII leak). Restricted to owner +
--      staff.

-- ---------------------------------------------------------------------------
-- 1. Tighten the safe public profiles view (audit §2.1 remediation).
-- ---------------------------------------------------------------------------
create or replace view public.public_profiles as
select
    id,
    display_name,
    avatar_url,
    bio,
    created_at
from public.profiles
where not coalesce(is_banned, false)
  and not coalesce(is_suspended, false);

grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Column-level PII revokes (direct reads; app uses service_role).
-- ---------------------------------------------------------------------------
-- profiles: email/phone must never be readable by anonymous callers.
revoke select (email, phone) on public.profiles from anon;
-- listings marketplace contacts (gated via revealSellerContact action).
revoke select (contact_phone, contact_email, whatsapp_number) on public.listings from anon, authenticated;
-- notices contact columns.
revoke select (contact_phone, contact_email) on public.notices from anon, authenticated;
-- fundraiser / event organizer contacts (not rendered on public pages).
revoke select (organizer_phone, organizer_email) on public.fundraisers from anon, authenticated;
revoke select (organizer_phone, organizer_email) on public.events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Constrained anonymous INSERT policies (defense in depth with the
--    honeypot + Turnstile + rate-limit + Zod gates in lib/public/actions.ts).
--    Service-role writes (all server actions) bypass RLS and are unaffected.
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone may submit content" on public.submissions;
create policy "Anyone may submit content"
    on public.submissions for insert
    with check (
        status = 'pending'
        and guest_name is not null
        and char_length(btrim(guest_name)) > 0
        and consent_confirmed = true
        and rights_confirmed = true
    );

drop policy if exists "Anyone may report content" on public.reports;
create policy "Anyone may report content"
    on public.reports for insert
    with check (
        status = 'open'
        and description is not null
        and char_length(btrim(description)) > 0
    );

drop policy if exists "Anyone may request corrections" on public.corrections;
create policy "Anyone may request corrections"
    on public.corrections for insert
    with check (
        status = 'open'
        and content_item_id is not null
        and correction_text is not null
        and char_length(btrim(correction_text)) > 0
    );

drop policy if exists "Anyone may request takedowns" on public.takedown_requests;
create policy "Anyone may request takedowns"
    on public.takedown_requests for insert
    with check (
        status = 'open'
        and claimant_name is not null
        and char_length(btrim(claimant_name)) > 0
        and rights_basis is not null
        and char_length(btrim(rights_basis)) > 0
    );

-- ---------------------------------------------------------------------------
-- 4. Close the data_requests anonymous read leak.
-- ---------------------------------------------------------------------------
drop policy if exists "Own data requests" on public.data_requests;
create policy "Own data requests"
    on public.data_requests for all
    using (requester_id = auth.uid() or public.is_staff())
    with check (
        status = 'open'
        and requester_email is not null
        and char_length(btrim(request_type)) > 0
    );

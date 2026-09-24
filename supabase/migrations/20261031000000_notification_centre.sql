-- ============================================================================
-- Migration: 20261031000000_notification_centre.sql
-- Description: Categorized admin notification centre (plan Phase 4.5, spec §38).
--
--   Spec §38 categorizes staff-facing notifications (Informational, Action
--   Required, Warning, Critical) and asks that each category be countable and
--   dismissible in one place. This is *not* the member `notifications` inbox
--   (user_id + type + read_at, delivered by the marketing/editorial system) nor
--   the `notification_outbox` email/queue — it is the admin-area message centre:
--   one row per notification per recipient, addressed and read individually.
--
--   The four categories are a check constraint rather than an enum: the
--   category list is presentation vocabulary (spec §38 pins exactly these four;
--   a fifth would be a spec change, not a data migration), and text keeps the
--   rows readable in the audit trail without a type cast.
--
--   `admin_notification_sources` is a registry, not a log: it names the systems
--   that are allowed to produce notifications ("track which system produced
--   each notification — for debugging", plan Phase 4.5). An FK from
--   `admin_notifications.source` means a producer must be registered before it
--   can write, so a new notification stream is a deliberate, reviewable act.
--
--   `link_path` is a locale-free in-app path (e.g. "/admin/incidents"). It is
--   validated to a same-origin path at write time (lib/admin/actions/
--   notifications.ts) and re-checked at render — a notification must never
--   carry a clickable off-site redirect.
--
--   `expires_at` supports transient notices (a resolved incident's banner):
--   expired rows are excluded at read time, so a stale notice disappears
--   without a cleanup job. NULL means "no expiry".
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Producer registry
-- ---------------------------------------------------------------------------
create table if not exists public.admin_notification_sources (
    key         text primary key,
    label       text not null,
    description text,
    created_at  timestamptz not null default now()
);

alter table public.admin_notification_sources enable row level security;

-- The registry is static vocabulary that the admin UI renders next to each
-- notification ("produced by …"): staff read it, only migrations write it.
drop policy if exists "Staff read notification sources" on public.admin_notification_sources;
create policy "Staff read notification sources"
    on public.admin_notification_sources for select using (public.is_staff());

insert into public.admin_notification_sources (key, label, description)
values
    ('system', 'System', 'Platform-generated notices from the admin backend.'),
    ('incidents', 'Incidents', 'Incident console updates and state-ladder changes.'),
    ('credentials', 'Credentials', 'Credential rotation, expiry and revocation reminders.'),
    ('approvals', 'Approvals', 'Two-person control requests awaiting a second approver.')
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.admin_notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    source     text not null references public.admin_notification_sources (key),
    category   text not null check (category in ('info', 'action_required', 'warning', 'critical')),
    title      text not null,
    body       text,
    -- Locale-free in-app path; validated at write time, re-checked at render.
    link_path  text,
    is_read    boolean not null default false,
    created_at timestamptz not null default now(),
    expires_at timestamptz
);

-- The centre lists newest-first per recipient.
create index if not exists admin_notifications_user_created_idx
    on public.admin_notifications (user_id, created_at desc);

-- Per-category unread counts (spec §38 badges) hit this partial index.
create index if not exists admin_notifications_unread_idx
    on public.admin_notifications (user_id, category) where not is_read;

alter table public.admin_notifications enable row level security;

-- A notification is addressed to one person: they read their own rows. Every
-- write (create / mark read / dismiss) goes through the service-role client in
-- lib/admin/actions/notifications.ts, so there is no INSERT/UPDATE/DELETE
-- policy — a cookie-scoped client cannot read or clear another admin's centre.
drop policy if exists "Users read own admin notifications" on public.admin_notifications;
create policy "Users read own admin notifications"
    on public.admin_notifications for select using (user_id = auth.uid());

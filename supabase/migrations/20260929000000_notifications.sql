-- Full notification loop: preferences, transactional outbox, in-app read path.
--
-- Channels: inapp (notifications table, immediate) + email (SMTP) + whatsapp
-- (Meta Cloud API). Staff alerts fan out at SEND time (worker reads current
-- admin/editor roster + prefs), so role changes apply without re-queuing.
-- Writes come from the service-role worker only — RLS stays closed otherwise.

create table if not exists public.notification_prefs (
    user_id     uuid primary key references public.profiles (id) on delete cascade,
    inapp       boolean not null default true,
    email       boolean not null default true,
    whatsapp    boolean not null default false,
    locale      text not null default 'en',
    updated_at  timestamptz not null default now()
);

create table if not exists public.notification_outbox (
    id                  uuid primary key default gen_random_uuid(),
    created_at          timestamptz not null default now(),
    -- staff = fan out to current admin/editor roster at send time;
    -- user  = single recipient_user_id.
    audience            text not null check (audience in ('staff', 'user')),
    recipient_user_id   uuid references public.profiles (id) on delete cascade,
    event               text not null,
    locale              text not null default 'en',
    title               text,
    title_fr            text,
    body                text,
    body_fr             text,
    data                jsonb,
    status              text not null default 'pending'
                        check (status in ('pending', 'sent', 'failed', 'skipped')),
    attempts            integer not null default 0,
    next_attempt_at     timestamptz not null default now(),
    sent_at             timestamptz,
    channels_sent       text[],
    last_error          text
);

create index if not exists notification_outbox_due_idx
    on public.notification_outbox (status, next_attempt_at) where status = 'pending';
create index if not exists notification_outbox_event_idx
    on public.notification_outbox (event, created_at desc);
create index if not exists notifications_user_read_idx
    on public.notifications (user_id, read_at);

alter table public.notification_prefs enable row level security;
alter table public.notification_outbox enable row level security;

-- Prefs: users own their row (the worker uses service-role, bypassing RLS).
drop policy if exists "Users read own prefs" on public.notification_prefs;
create policy "Users read own prefs" on public.notification_prefs
    for select using (user_id = auth.uid());
drop policy if exists "Users save own prefs" on public.notification_prefs;
create policy "Users save own prefs" on public.notification_prefs
    for insert with check (user_id = auth.uid());
drop policy if exists "Users update own prefs" on public.notification_prefs;
create policy "Users update own prefs" on public.notification_prefs
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Outbox: staff read everything (queue visibility in /admin/notifications),
-- users read their own direct rows. No client insert/update — worker only.
drop policy if exists "Staff read outbox" on public.notification_outbox;
create policy "Staff read outbox" on public.notification_outbox
    for select using (public.is_staff());
drop policy if exists "Users read own outbox rows" on public.notification_outbox;
create policy "Users read own outbox rows" on public.notification_outbox
    for select using (recipient_user_id = auth.uid());

-- In-app: users can mark their own notifications read (select policy exists).
drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

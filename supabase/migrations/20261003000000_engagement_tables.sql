-- ============================================================================
-- Migration: 20261003000000_engagement_tables.sql
-- Description: Reader-engagement tables — event reminders + content feedback.
--
--   * event_reminders: a user asks to be notified before a culture event
--     starts (remind_at presets). The /api/cron/reminders worker delivers
--     due rows as in-app notifications and stamps sent_at (idempotent:
--     only sent_at IS NULL rows are picked up).
--   * content_feedback: one helpful/not-helpful vote per user per content
--     item (upsert on the pair). Anonymous votes are intentionally not
--     stored — spam resistance over frictionless voting.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Event reminders
-- ---------------------------------------------------------------------------
create table if not exists public.event_reminders (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles (id) on delete cascade,
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    remind_at       timestamptz not null,
    sent_at         timestamptz,
    created_at      timestamptz not null default now(),
    unique (user_id, content_item_id)
);

create index if not exists event_reminders_due_idx
    on public.event_reminders (remind_at) where sent_at is null;

alter table public.event_reminders enable row level security;

drop policy if exists "Own event reminders" on public.event_reminders;
create policy "Own event reminders"
    on public.event_reminders for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Content feedback (was-this-helpful votes)
-- ---------------------------------------------------------------------------
create table if not exists public.content_feedback (
    user_id         uuid not null references public.profiles (id) on delete cascade,
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    helpful         boolean not null,
    created_at      timestamptz not null default now(),
    primary key (user_id, content_item_id)
);

alter table public.content_feedback enable row level security;

drop policy if exists "Own content feedback" on public.content_feedback;
create policy "Own content feedback"
    on public.content_feedback for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Feedback counts are public" on public.content_feedback;
create policy "Feedback counts are public"
    on public.content_feedback for select using (true);

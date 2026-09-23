-- W14 (P2) — account safety: user blocks.
--
-- The buyer/seller trust loop (audit H3) lacked its stop control: a harassed
-- or targeted seller/buyer could only abandon the conversation. A block is
-- unilateral and private:
--   * the blocker stops seeing the thread and cannot be messaged by the
--     blocked user (enforced in lib/messages/actions.ts before every insert);
--   * the blocked user is NOT notified (notification would defeat the purpose);
--   * rows are visible only to the blocker — no admin surface, no PII leak;
--   * unblock = delete of the blocker's own row (RLS-scoped).
--
-- Defense in depth (architecture-checklist): app actions check user_blocks
-- before writing a message; RLS keeps block rows private even if an action
-- has a bug; the existing messages RLS still requires conversation membership.

create table if not exists public.user_blocks (
    id         uuid primary key default gen_random_uuid(),
    blocker_id uuid not null references auth.users (id) on delete cascade,
    blocked_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint user_blocks_distinct check (blocker_id <> blocked_id),
    constraint user_blocks_pair unique (blocker_id, blocked_id)
);

-- Reverse lookup ("have I blocked them / have they blocked me") runs on every
-- send; the unique constraint already covers the (blocker, blocked) direction.
create index if not exists user_blocks_blocked_id_idx
    on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Private to the blocker: no SELECT for the blocked user or anonymous
-- visitors, no UPDATE at all (rows are immutable facts).
drop policy if exists "Own blocks: select" on public.user_blocks;
create policy "Own blocks: select"
    on public.user_blocks for select
    using (auth.uid() = blocker_id);

drop policy if exists "Own blocks: insert" on public.user_blocks;
create policy "Own blocks: insert"
    on public.user_blocks for insert
    with check (auth.uid() = blocker_id);

drop policy if exists "Own blocks: delete" on public.user_blocks;
create policy "Own blocks: delete"
    on public.user_blocks for delete
    using (auth.uid() = blocker_id);

-- Authenticated callers only: blocks are a signed-in control, never anon.
grant select, insert, delete on public.user_blocks to authenticated;

-- Enforcement helper for the send path. The *blocked* party must also be
-- stopped from messaging, but their SELECT on user_blocks is denied by
-- design (seeing "I am blocked" would leak who blocks). This SECURITY
-- DEFINER RPC answers a bare boolean for a pair the caller already belongs
-- to; the app layer never passes third-party pairs. Explicit search_path +
-- no PUBLIC execute keep it posture-clean.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id = a and ub.blocked_id = b)
           or (ub.blocker_id = b and ub.blocked_id = a)
    );
$$;

revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Audited safety actions: the pre-existing staff policy derives WITH CHECK
-- from is_staff(), which would silently swallow member block/unblock audit
-- rows. Members may append only their own user_block/user_unblock entries;
-- staff keep full read/manage through "Staff manage moderation log".
drop policy if exists "Members log their own safety actions" on public.moderation_log;
create policy "Members log their own safety actions"
    on public.moderation_log for insert
    to authenticated
    with check (
        actor_id = (select auth.uid())
        and action in ('user_block', 'user_unblock')
        and content_item_id is null
        and submission_id is null
        and from_status is null
        and to_status is null
    );
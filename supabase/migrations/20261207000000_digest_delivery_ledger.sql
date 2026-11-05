-- Durable daily/weekly digest snapshots and per-subscriber channel attempts.
-- `unknown` is deliberately not auto-retried: the provider may have accepted
-- the message before the connection failed.
create table if not exists public.digest_delivery_batches (
    id uuid primary key default gen_random_uuid(),
    sent_on date not null,
    cadence text not null check (cadence in ('daily', 'weekly')),
    locale text not null check (locale in ('en', 'fr')),
    date_label text not null,
    subject text not null,
    intro text,
    stories jsonb not null,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    unique (sent_on, cadence, locale)
);

create table if not exists public.digest_delivery_attempts (
    id uuid primary key default gen_random_uuid(),
    batch_id uuid not null references public.digest_delivery_batches(id) on delete cascade,
    subscriber_id uuid not null references public.digest_subscribers(id) on delete cascade,
    channel text not null check (channel in ('email', 'whatsapp')),
    status text not null check (status in ('pending', 'sending', 'sent', 'failed', 'unknown', 'cancelled')),
    attempts integer not null default 0 check (attempts >= 0),
    last_error text,
    updated_at timestamptz not null default now(),
    unique (batch_id, subscriber_id, channel)
);

create index if not exists digest_delivery_attempts_retry_idx
    on public.digest_delivery_attempts (batch_id, status)
    where status in ('pending', 'failed', 'unknown', 'sending');

alter table public.digest_delivery_batches enable row level security;
alter table public.digest_delivery_attempts enable row level security;

revoke all on public.digest_delivery_batches, public.digest_delivery_attempts
    from public, anon, authenticated;
grant all on public.digest_delivery_batches, public.digest_delivery_attempts to service_role;

create or replace function public.digest_create_delivery_batch(
    p_sent_on date,
    p_cadence text,
    p_locale text,
    p_date_label text,
    p_subject text,
    p_intro text,
    p_stories jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_batch_id uuid;
begin
    insert into public.digest_delivery_batches (
        sent_on, cadence, locale, date_label, subject, intro, stories
    )
    values (p_sent_on, p_cadence, p_locale, p_date_label, p_subject, p_intro, p_stories)
    on conflict (sent_on, cadence, locale) do nothing
    returning id into v_batch_id;

    if v_batch_id is null then
        select id into v_batch_id
          from public.digest_delivery_batches
         where sent_on = p_sent_on
           and cadence = p_cadence
           and locale = p_locale;
        return v_batch_id;
    end if;

    insert into public.digest_delivery_attempts (batch_id, subscriber_id, channel, status, attempts)
    select v_batch_id, s.id, c.channel, 'pending', 0
      from public.digest_subscribers s
      cross join lateral (
          values
              ('email'::text, s.email),
              ('whatsapp'::text, coalesce(s.whatsapp, s.phone))
      ) as c(channel, destination)
     where s.is_active
       and case when s.locale ilike 'fr%' then 'fr' else 'en' end = p_locale
       and nullif(btrim(c.destination), '') is not null
       and c.channel in ('email', 'whatsapp')
    on conflict (batch_id, subscriber_id, channel) do nothing;

    return v_batch_id;
end;
$$;

create or replace function public.digest_claim_delivery(
    p_batch_id uuid,
    p_subscriber_id uuid,
    p_channel text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_claimed uuid;
begin
    if p_channel not in ('email', 'whatsapp') then
        raise exception 'Unsupported digest delivery channel';
    end if;

    update public.digest_delivery_attempts
       set status = 'sending',
           attempts = attempts + 1,
           last_error = null,
           updated_at = now()
     where batch_id = p_batch_id
       and subscriber_id = p_subscriber_id
       and channel = p_channel
       and status in ('pending', 'failed')
       and exists (
           select 1
             from public.digest_subscribers s
            where s.id = p_subscriber_id
              and s.is_active
       )
    returning id into v_claimed;

    return v_claimed is not null;
end;
$$;

create or replace function public.digest_finish_delivery(
    p_batch_id uuid,
    p_subscriber_id uuid,
    p_channel text,
    p_status text,
    p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_status not in ('sent', 'failed', 'unknown', 'cancelled') then
        raise exception 'Unsupported digest delivery status';
    end if;

    update public.digest_delivery_attempts
       set status = p_status,
           last_error = left(p_error, 500),
           updated_at = now()
     where batch_id = p_batch_id
       and subscriber_id = p_subscriber_id
       and channel = p_channel
       and status = 'sending';

    if not found then
        raise exception 'Digest delivery attempt is not in sending state';
    end if;
end;
$$;

revoke all on function public.digest_claim_delivery(uuid, uuid, text)
    from public, anon, authenticated;
revoke all on function public.digest_create_delivery_batch(date, text, text, text, text, text, jsonb)
    from public, anon, authenticated;
revoke all on function public.digest_finish_delivery(uuid, uuid, text, text, text)
    from public, anon, authenticated;
grant execute on function public.digest_create_delivery_batch(date, text, text, text, text, text, jsonb)
    to service_role;
grant execute on function public.digest_claim_delivery(uuid, uuid, text) to service_role;
grant execute on function public.digest_finish_delivery(uuid, uuid, text, text, text) to service_role;

comment on table public.digest_delivery_batches is
    'Immutable digest content snapshots retained so failed subscriber deliveries can be retried without resending to successful subscribers.';
comment on table public.digest_delivery_attempts is
    'Per-subscriber/channel delivery ledger. Failed attempts may be retried; unknown attempts require operator review before retry.';
comment on function public.digest_create_delivery_batch(date, text, text, text, text, text, jsonb) is
    'Atomically persists an immutable digest snapshot and active subscriber/channel queue; retries reuse the original recipient cohort.';
comment on function public.digest_claim_delivery(uuid, uuid, text) is
    'Atomically claims a pending or confirmed-failed digest delivery; sent, sending, and unknown attempts are never automatically resent.';
comment on function public.digest_finish_delivery(uuid, uuid, text, text, text) is
    'Finalizes a claimed digest delivery as sent, failed, unknown, or cancelled; service-role only.';

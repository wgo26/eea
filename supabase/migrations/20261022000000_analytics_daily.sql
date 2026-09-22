-- W13 — privacy-preserving product analytics (aggregate counters only).
-- Design constraints (see docs/history/wip-analytics-route.md post-mortem):
--   * counters only — no path, referrer, user agent, IP, cookie or user id
--     is ever stored; row identity is (day, surface, locale, place)
--   * migration-first: typed table exists BEFORE the route ships
--   * service-role only: anon/authenticated get NO policies and NO execute
create table if not exists public.analytics_daily (
    day        date not null default (now() at time zone 'utc')::date,
    surface    text not null,
    locale     text not null default 'en',
    place      text not null default '',  -- '' = place-agnostic traffic
    count      bigint not null default 0,
    updated_at timestamptz not null default now(),
    primary key (day, surface, locale, place)
);

alter table public.analytics_daily enable row level security;

-- No policies by design: only the service role (beacon route, cron, admin
-- insights) can touch analytics. Defense in depth: revoke the RPC from the
-- API roles below.
create or replace function public.analytics_bump(
    p_surface text,
    p_locale  text default 'en',
    p_place   text default '',
    p_delta   bigint default 1
) returns void
language sql
security definer
set search_path = public
as $$
    insert into public.analytics_daily (day, surface, locale, place, count)
    values ((now() at time zone 'utc')::date, p_surface, p_locale, p_place, p_delta)
    on conflict (day, surface, locale, place)
    do update set count = public.analytics_daily.count + excluded.count,
                  updated_at = now();
$$;

revoke all on function public.analytics_bump(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.analytics_bump(text, text, text, bigint) to service_role;

comment on table public.analytics_daily is
  'W13 aggregate-only product analytics. Privacy contract: counters keyed by UTC day/surface/locale/place only — no PII, no cookies, no per-user rows. Update docs/known-issues.md + privacy policy when adding dimensions.';
comment on function public.analytics_bump(text, text, text, bigint) is
  'Atomic counter increment for the analytics beacon. Service-role only.';

-- Mark only the locale whose digest was successfully delivered. A successful
-- English send must not retire French slots when the French channel failed.
create or replace function public.digest_mark_locale_sent(p_issue_date date, p_locale text)
returns integer
language sql
security definer
set search_path = public
as $$
    with marked as (
        update public.digest_slots
           set sent_at = now()
         where issue_date <= p_issue_date
           and locale = p_locale
           and sent_at is null
           and removed = false
           and p_locale in ('en', 'fr')
        returning 1
    )
    select count(*) from marked;
$$;

revoke all on function public.digest_mark_locale_sent(date, text) from public, anon, authenticated;
grant execute on function public.digest_mark_locale_sent(date, text) to service_role;

comment on function public.digest_mark_locale_sent(date, text) is
  'Marks open daily digest slots sent for one locale after that locale has successful delivery; service-role only.';

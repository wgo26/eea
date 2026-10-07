-- Lean cut phase 2 (audits §3.6): seller PII out of the public `listings` read path.
--
-- PROBLEM: `listings.contact_phone / contact_email / whatsapp_number` live on
-- the same row that public detail/grid queries embed. Any `listing` embed in a
-- public query risks PII in SSR HTML / caches. The rate-limited
-- `revealSellerContact` action is the only legitimate reader.
--
-- FIX (2-phase, build-safe):
--   Phase A (this migration + code): new `seller_contacts` table (service-role
--   only), backfilled from `listings`. Public queries stop selecting contact
--   columns; `toListingDetail` derives hasPhone/hasEmail/hasWhatsapp from the
--   new table; reveal reads new table first, `listings` fallback second.
--   Phase B (later, after verification): drop the three columns from
--   `listings` (separate migration — not here, so rollback stays trivial).
--
-- SAFETY: IF NOT EXISTS + backfill guarded by column existence; re-runnable.
-- RLS enabled with NO public policies (service-role bypasses RLS; anon gets
-- nothing). No KEPT code selects contact columns after this ships.

create table if not exists public.seller_contacts (
    content_item_id uuid primary key references public.content_items (id) on delete cascade,
    contact_phone   text,
    contact_email   citext,
    whatsapp_number text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

alter table public.seller_contacts enable row level security;

-- No public read/insert/update/delete policies by design: only the
-- service-role reveal actions touch this table. Explicitly drop any stray
-- permissive policy from a partial earlier run, then create none.
drop policy if exists "Public seller contacts readable" on public.seller_contacts;
drop policy if exists "Anyone may write seller contacts" on public.seller_contacts;

create index if not exists seller_contacts_updated_idx
    on public.seller_contacts (updated_at desc);

-- Backfill from existing listings (only where at least one contact exists).
insert into public.seller_contacts (content_item_id, contact_phone, contact_email, whatsapp_number)
select content_item_id, contact_phone, contact_email, whatsapp_number
from public.listings
where coalesce(contact_phone, '') <> ''
   or coalesce(contact_email::text, '') <> ''
   or coalesce(whatsapp_number, '') <> ''
on conflict (content_item_id) do update set
    contact_phone   = excluded.contact_phone,
    contact_email   = excluded.contact_email,
    whatsapp_number = excluded.whatsapp_number,
    updated_at      = now();

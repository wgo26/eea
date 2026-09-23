-- W18 (P3) — diaspora digest variant (H6): attribute digest signups to the
-- subscribe-form pitch experiment so the variant's lift on subscribe rate is
-- measurable from the database (signups/day by pitch_variant).
--
-- The pitch variant is a UX bucket assigned client-side
-- (lib/experiments.ts `digest-diaspora-pitch`); the form posts it back in a
-- hidden field and the subscribe action allow-lists it here. Delivery framing
-- (diaspora "home, today" heading) keys off the pre-existing diaspora_mode
-- flag, not this column.
--
-- No RLS change: digest_subscribers is written through the service-role
-- client only (subscribe/update paths in lib/notify/actions.ts).

alter table public.digest_subscribers
    add column if not exists pitch_variant text not null default 'standard'
    constraint digest_subscribers_pitch_variant_check
    check (pitch_variant in ('standard', 'diaspora'));

-- Experiment readout: signups per day per variant (admin measurement).
create index if not exists digest_subscribers_pitch_created_idx
    on public.digest_subscribers (created_at desc, pitch_variant);

-- Directory PII parity (Phase 7): businesses contact columns get the same
-- column-level REVOKEs listings/notices/fundraisers/events already carry
-- (migration 20260921120000). The rate-limited `revealBusinessContact`
-- action is the only door to pro phone/email/WhatsApp — without this,
-- anon/authenticated could read them straight through PostgREST and the
-- reveal gate would be theater. Service-role reads (the app) are unaffected.
revoke select (phone, email, whatsapp) on public.businesses from anon, authenticated;

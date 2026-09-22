-- ============================================================================
-- RLS coverage repair — moderation_log + ad_events (audit W3/D3)
-- ============================================================================
-- Found by the RLS harness structural gate: exactly two public tables shipped
-- without `enable row level security`. Hosted Supabase grants ALL privileges
-- on new public tables to anon/authenticated/service_role by default, so
-- "RLS enabled" is the only thing separating an internal table from a public
-- one. Policies alone are decorative without the switch.
--
-- moderation_log — the internal audit trail (staff actions, rejection
--   reasons, resolution notes). The init schema defined
--   "Staff manage moderation log" (for ALL using is_staff()) but never
--   enabled RLS, so the policy never applied: with hosted default grants any
--   anonymous visitor could read the full audit trail AND forge/erase audit
--   rows. Enabling RLS makes the existing staff policy operative; anon and
--   authenticated members are denied outright (no read/write policy for
--   them, by design — the audit trail is internal).
--
-- ad_events — ad impression/click records backing advertiser reporting and
--   billing. Without RLS the default grants allowed anonymous reads
--   (competitor intelligence on bookings/traffic) and anonymous INSERTs
--   (impression/click inflation — directly corrupting what advertisers pay
--   for; see audit R9). Writes arrive only through the security-definer
--   `increment_ad_event` RPC; the table stays closed to every non-owner role
--   (no policies at all).
--
-- Idempotent; safe to run twice. `npm test`'s RLS harness (ci job
-- `rls-invariants`) fails if any future table regresses on this gate.
-- ============================================================================

alter table public.moderation_log enable row level security;

alter table public.ad_events enable row level security;

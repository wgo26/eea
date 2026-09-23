# W19 decision — WhatsApp *is* the low-barrier channel (no SMS/USSD pilot)

**Status:** decided 2026-09-23 · **Revisit when:** WhatsApp Cloud API proves
unviable in production (template rejection, number ban, or cost shock) or a
funder explicitly requires USSD reach.

## The gap

`features.md` lists "SMS or USSD fallback for submissions in
low-connectivity areas". The premise: some contributors cannot use the web
submit forms, so a text-message intake path would widen participation.

## Why WhatsApp instead of SMS/USSD

1. **It is already the product's low-barrier channel.** Outbound WhatsApp is
   built and wired: template + free-text sends (`lib/notify/channels.ts`),
   the WhatsApp-first Daily Brief (Differentiator #9, `lib/digest/brief.ts`),
   subscriber phone capture on the digest form, `wa.me` manual fallbacks in
   the admin queue, and the full production checklist in
   `docs/whatsapp-template.md` / `docs/notifications.md`. An SMS/USSD pilot
   would duplicate this loop on a second vendor, second sender identity, and
   second moderation intake — before the first loop has proven itself live
   (R6: template approval + handset preview still pending).
2. **Cost and capability.** SMS is per-message priced in both directions and
   carries no media; USSD is session-based, operator-negotiated per market,
   and carries no media either. WhatsApp carries the photos that make Eye on
   the Street work, at template-message pricing, on the app the audience
   already has installed (WhatsApp-first distribution is a stated
   differentiator, `features.md` §4).
3. **The connectivity argument cuts both ways.** True offline areas have
   neither WhatsApp nor USSD-gateway coverage guaranteed; where 2G texting
   works, WhatsApp's low-data mode usually does too. The web submit forms
   plus the WhatsApp loop cover the realistic spectrum.

## What this decides

- **No SMS/USSD intake path.** No Twilio/Africa's-Talking dependency, route,
  table, or env surface. The commented `[auth.sms]` stub in
  `supabase/config.toml` stays a stub (auth OTP is not a submission channel).
- **The low-connectivity story is:** lightweight web submit forms (already
  mobile-first, low-bandwidth per `features.md` §3) + WhatsApp distribution
  and digest loops for reach + in-person contribution drives where needed.
- **Launch blocker order:** R6 (WhatsApp production reality) is the validation
  that closes this gap, not a parallel pilot.

## If this is ever revisited

A pilot would need: a per-market gateway decision (Africa's Talking vs
Twilio), an inbound webhook → `submissions` intake with the same consent /
rights confirmations as web intake, sender-identity costs per market, and a
moderation-queue source label. None of that is built; this doc is the
explicit decision not to build it now.

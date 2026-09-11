# Notifications — the per-event loop

Staff used to learn about work by opening admin pages or waiting for the
nightly ops-digest webhook. Now every intake and every decision enqueues an
alert, and a worker delivers it across three channels per recipient prefs.

## How it flows

```
intake / moderation action
  → lib/notify/queue.ts (enqueue, best-effort, never fails the user action)
  → notification_outbox (status pending)
  → /api/cron/notify every 15 min → lib/notify/worker.ts
  → in-app (notifications table) + email (SMTP) + WhatsApp (Cloud API)
```

Events live in `lib/notify/events.ts` (bilingual title/body + staff
deep-links). Staff alerts fan out at **send time** to the current
admin/editor roster, honoring each person's prefs — role changes apply
without re-queuing.

## Channels (WhatsApp-first by design)

| Channel | Config | Notes |
|---|---|---|
| In-app | none — always works | Bell badge in the account topbar, inbox at `/account/notifications` |
| Email | `SMTP_HOST/PORT/USER/PASS/FROM` | Same host as the Supabase custom SMTP. Bilingual branded HTML. |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API text messages. Highest open rates — **opt-in only** (prefs default off). Works inside the 24h customer-service window; request a utility template for out-of-window sends. |

Unconfigured channels record honest `skipped` rows — the worker stays green
while setup finishes. Channel status is visible in `/admin/notifications`.

## Schedules

- `*/15 * * * *` → `/api/cron/notify` (vercel.json + scheduled-jobs.yml).
- `0 6 * * *` → `/api/cron/ops-digest` (nightly watchdog summary — kept).
- Manual: "Run worker now" and "Send test to me" in `/admin/notifications`.

## WhatsApp setup (Meta)

1. developers.facebook.com → create a WhatsApp app → API Setup.
2. Add a recipient test number, send a test from the admin panel.
3. Request production + template approval for proactive alerts.
4. Set `WHATSAPP_TOKEN` (system-user token, never expires) +
   `WHATSAPP_PHONE_NUMBER_ID` on the host.

Staff phone numbers come from `profiles.phone`; users opt in at
`/account/notifications`. Until the API is configured, the admin queue
shows per-row contacts — pair with `wa.me` links for manual follow-up.

## What not to do

- Never enqueue inside a transaction you might roll back (call after success).
- Never put PII in titles (bodies carry the minimum; full rows stay in admin).
- Guests (no account) get no direct notifications — their receipt is the
  confirmation screen. Staff still get the moderation alert.

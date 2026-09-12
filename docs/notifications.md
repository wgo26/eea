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
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API text messages. Highest open rates — **opt-in only** (prefs default off). Free text works inside the 24h customer-service window; outside it the worker falls back to the utility template on 24h-window error 131047. |
| WhatsApp template | `WHATSAPP_TEMPLATE` (+`_LANG`, default `en`), optional `WHATSAPP_TEMPLATE_FR` (+`_FR_LANG`, default `fr`) | Body-only utility template(s) with a single `{{1}}` parameter; French recipients get the `_FR` twin, else the base language. Exact bodies to submit: `docs/whatsapp-template.md`. |

Unconfigured channels record honest `skipped` rows — the worker stays green
while setup finishes. Channel status is visible in `/admin/notifications`.

## Schedules

- `*/15 * * * *` → `/api/cron/notify` (vercel.json + scheduled-jobs.yml).
- `0 6 * * *` → `/api/cron/ops-digest` (nightly watchdog summary — kept).
- Manual: "Run worker now" and "Send test to me" in `/admin/notifications`.
- Retention: each worker run prunes terminal outbox rows (`sent` /
  `failed` / `skipped`) older than 90 days (`OUTBOX_RETENTION_DAYS` in
  `lib/notify/worker.ts`), 500 per run — pending rows are never touched.

## Local testing

```bash
node scripts/seed-notify.mjs [--user <profile-uuid>]
```

Seeds one pending staff demo row (visible in `/admin/notifications` with
working per-row actions) plus one **inactive** demo digest subscriber
(`demo-notify@example.com` — a sink address). `--user` also upserts that
profile's prefs (WhatsApp on, quiet 22→7) so the account UI shows
non-default values. "Run worker now" delivers the demo row in-app to
current staff; remove everything with `node scripts/teardown-demo.mjs`.

## WhatsApp setup (Meta)

1. developers.facebook.com → create a WhatsApp app → API Setup.
2. Add a recipient test number, send a test from the admin panel.
3. Request production + template approval for proactive alerts: create a
   **body-only `utility` template with a single `{{1}}` text parameter**
   (no header, no buttons — the alert text lands in `{{1}}`), then set
   `WHATSAPP_TEMPLATE` to its name and `WHATSAPP_TEMPLATE_LANG` (`en`
   default). Without it, sends outside the 24h customer-service window
   fail; with it, the worker falls back automatically (error 131047) and
   the 06:00 digest fan-out sends via template first.
4. Set `WHATSAPP_TOKEN` (system-user token, never expires) +
   `WHATSAPP_PHONE_NUMBER_ID` on the host.

Staff phone numbers come from `profiles.phone`; users opt in at
`/account/notifications`. Until the API is configured, each queue row
offers a prefilled `wa.me` link (direct recipients) or a copy-text button
(staff fan-out rows) for manual follow-up — see `manualHint` in
`/admin/notifications`.

## Quiet hours

`notification_prefs.quiet_start/quiet_end` (migration
`20260930000000`) hold **email + WhatsApp** inside the window
`[start, end)` in **Africa/Douala local hours** (wraps midnight, so 22→7
means 22:00–06:59); in-app alerts always deliver. NULL bounds or
start = end = no quiet hours. Set under `/account/notifications`; the
worker counts held recipients as `deferred` in its summary.

## Guest receipts (explicit anti-spam policy)

Guests have no account so the outbox loop can't reach them. They get exactly
one direct SMTP receipt per successful intake (`lib/notify/guest-receipts.ts`,
best-effort, never fails the submission):

- only to the address the guest typed on that form (validated, no list);
- one-off content (submission / advertise / contact / takedown / data /
  correction), bilingual, with a "one-off receipt, not a subscription" footer;
- no marketing, no bulk, no decision follow-ups — moderation outcomes stay
  staff-side; signed-in users additionally get the in-app loop.
- unconfigured/invalid SMTP = logged skip, intake still succeeds.

The public daily digest is strictly opt-in at `/digest` (double purpose:
email and/or WhatsApp). The nightly `/api/cron/ops-digest` fans out the
day's published stories to `digest_subscribers` where `is_active`.

## Production checklist (pre-launch)

Run `npm run notify:env` first (warn-only for missing providers, errors on
malformed values), then work this list:

- **SMTP**: same host for Supabase custom SMTP **and** app `SMTP_*`;
  verify SPF + DKIM + DMARC on the sending domain; send a guest receipt
  (submit as a guest with your address) and confirm it lands in-inbox.
- **WhatsApp**: production number approved; utility template(s) approved
  (`WHATSAPP_TEMPLATE` +`_LANG`, plus the `_FR` twin — exact bodies in
  `docs/whatsapp-template.md`); "Send test to me" in
  `/admin/notifications` shows `Sent 1` and the message arrives on a real
  handset — reply to it to open the 24h window, then confirm a second
  alert arrives as free text.
- **Cron**: `CRON_SECRET` (16+ chars) on the host; `/api/cron/notify`
  every 15 min, `/api/cron/ops-digest` 06:00 UTC (vercel.json +
  scheduled-jobs.yml); uptime monitor against `/api/ready`
  (docs/observability.md §3).
- **Migrations**: `supabase db push` — includes `20260929000000_notifications`
  (outbox + prefs) and `20260930000000_notification_quiet_hours`.
- **Link previews**: open a story link in WhatsApp on a real handset and
  confirm the OG card renders (canonical/hreflang/OG ship per page).

## What not to do

- Never enqueue inside a transaction you might roll back (call after success).
- Never put PII in titles (bodies carry the minimum; full rows stay in admin).
- Never add a guest address to any list — receipts are one-off sends only.
  Staff still get the moderation alert.
- Never log tokens or phone numbers — channel logs carry only the error
  and (for email) the domain.

# Community live broadcasts — operator runbook

Embed-first live events for culture gatherings (Phase 3 + 7). No ingest
infrastructure is needed for the default path.

## Going live (staff, `broadcast.live`)

1. Open the event page (`/culture/events/<slug>`) while signed in as staff.
2. In the **Community live** desk: pick YouTube Live or Facebook Live, paste
   the watch URL, **Save stream**, then **Go live**.
3. Ending: **End broadcast**, optionally pasting the recording URL and the
   published recap story's UUID. Reminder holders are notified on go-live and
   again when a recording/recap lands.

## Providers

| Provider | What to paste | Cost |
|---|---|---|
| YouTube Live | `youtube.com/watch?v=…` / `youtu.be/…` / `/live/…` | Free (Google account) |
| Facebook Live | facebook watch URL | Free (page) |
| Native ingest | — | Disabled until enabled below |

## Enabling native ingest (Mux/Livepeer)

Native ingest is gated by the `live.native_enabled` app flag (default off).
Do not enable it until ingest infrastructure exists and someone owns the bill:

- Provision Mux or Livepeer, store keys in Secrets (never in code/env files
  that ship).
- Wire the provider's stream-key handoff into `setBroadcastStream`, then flip
  `live.native_enabled` on. Until then the desk explains what is missing
  instead of failing silently.

## Trust & safety

- Chat is live-only, 500 chars, 10s slow-mode, rate-limited per viewer.
- Moderators hide abuse from the message row (`moderate`); viewers report via
  the flag, which lands in the trust & safety queue as an `abuse` report with
  the message id attached.
- Every go-live/end/stream-set is audited in `moderation_log`.

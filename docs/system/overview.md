# System & infrastructure — overview

The five tabs under **System & infrastructure** (`/admin/*`, chief only) are
**controls**, not reports — except Audit, which is the record of everything
the other four (and the whole admin) did.

## The five tabs in one paragraph each

- **Platform states** (`/admin/states`) — "what mode is the platform in?"
  A lighting desk: one seasonal/operational context at a time (Back to
  School, Holiday, Election, Maintenance, Degraded…). Schedules light the
  seasons; you light Maintenance before deploys and clear things back to
  `NORMAL`. Full guide: `states.md`.
- **Credentials** (`/admin/secrets`) — the runtime key vault (DeepL, Resend,
  WhatsApp…), **not** a mirror of the host's `.env`. Host env vars are
  build-time config the app cannot list or change; this vault holds
  provider keys with a rotation lifecycle, and its one-time Reveal is how a
  value gets *into* the host without a redeploy. Full guide:
  `credentials.md`.
- **Storage & backup** (`/admin/storage-backup`) — "are our files safe?"
  Glance at three numbers (pending backup ≈ 0, pending verification ≈ 0,
  last backup = last night) and intervene only when the queue disagrees:
  retry failures, drill restores, scan orphans. Full guide: `storage.md`.
- **Audit log** (`/admin/audit-log`) — "who did what, exactly?" The
  compliance record across everything, with actor filter, reproducible CSV
  export, hash-chain verification and a monthly cold archive. Full guide:
  `audit.md`.
- **Security** (`/admin/security`) — "is something wrong right now?" The
  interpreted lens: failed-login heatmap, anomalies, key lifecycle, blocklist.
  Read it weekly; it takes two minutes. Full guide: `security.md`.

## Audit vs Security (why both)

Same underlying data, different questions. **Security tells you something
happened** (a spike, a repeat offender, an unexpected reveal); **Audit log
tells you exactly what** (who, which row, which request, full metadata).
Workflow: Security weekly → anything odd → Audit filtered to the actor/action
→ export the CSV as evidence.

## Credentials vs host env (why the tab can't show `.env`)

Two separate systems that never overlap: host env vars are read by code via
`process.env` at build/deploy time — no code path leads from the app back to
the host's env table, so no UI can list or edit them. The vault stores
provider keys *you* paste in, encrypted, with rotation. The loop is
one-directional: rotate/reveal here → paste into the host → mark steps.
A UI that edits host env would need host-API integration plus a rebuild
trigger per change — deliberately not built (rare, high-blast-radius).

## Chief essentials (the 10-minute version)

1. TOTP enrolled on your account (`totp.md`).
2. `CREDENTIAL_ENCRYPTION_KEY` + `CRON_SECRET` set on the host; rebuild +
   redeploy; 12 cron jobs scheduled (see `storage.md` for the table).
3. Real provider keys stored with expiry + 90-day rotation; each tested live.
4. Weekly: Security 2-minute review. Monthly: one restore drill, one rotation
   end-to-end. Quarterly: per-chief audit review.

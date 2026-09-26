# Credentials — rotation without redeploys

**Where:** `/admin/secrets` (chief only). **Purpose:** store provider keys
encrypted at rest, validate them live, and rotate them on a schedule —
without ever redeploying to read a value back.

## Seeing values (the no-redeploy loop)

- The list and detail screens show **metadata only**: name, provider,
  category, `v{version}`, expiry, rotation schedule, last use. Values render
  as `••••••••••••••••`.
- **Reveal current value** (chief-only, `secrets.reveal`): confirm the dialog,
  present the second factor when enrolled, and the value shows **once** in the
  one-time panel (copy / download / dismiss). Every reveal is audited as
  `credential.revealed` with your name — reveals are attributable by design.
- **Rotate** generates a strong replacement (or pastes a provider-issued one)
  and shows it **once**. The old value keeps working until you confirm
  `retire_old` at the provider — that transition window is the whole point:
  nothing is revoked automatically.
- Rotation runbook: Generate → **Test value** (live probe) → paste the new
  value into the provider / host env → **Mark deployed** → **Mark verified**
  → retire at the provider → **Confirm retired**. Emergency invalidation is
  separate: **Revoke** (two-person approval + second factor, terminal).

## Live validation

`Test value` probes the provider with a header-only GET (a secret never rides
in a URL): DeepL (`/v2/usage`, `:fx` keys go to the free host), Meta/WhatsApp
(`/me`), OpenAI (`/v1/models`), Resend (`/domains`). Anything else gets an
honest format check (`live: false`). Pass + live bumps `last_used_at`.

## Reminders & hygiene (automation)

- `rotation_policy.intervalDays` feeds *next rotation due*; expiry is derived
  on read (no sweep needed — the list flags `expired` itself).
- `credential-hygiene` cron, Mondays 08:00 UTC: scans for **expired**,
  **rotation-due** and **expiring-within-14-days** values and pages staff with
  one `credential.hygiene` alert (notification centre + digest channels).
  Heartbeat grace 8 days — a missed Monday is visible in `/api/ready`.

## Data model & crypto (for debugging)

- `api_credentials`: AES-256-GCM `v1.iv.tag.ciphertext` (base64url), key from
  `CREDENTIAL_ENCRYPTION_KEY` (32 bytes, hex or base64). **Rotating the KEK
  orphans every row** — there is no envelope/key-versioning; back the key up
  offline before touching it. With no key the tab degrades (warning) and
  create/rotate/reveal refuse.
- `credential_events`: lifecycle log (`created/rotated/validated/deployed/…`)
  feeding the rotation stepper; `audit_events` (`api_credential`) is the
  compliance mirror — neither ever carries secret material.
- Reads never select `secret_encrypted` except `readCredentialSecret`, used
  only by the probe and the step-up reveal.

## Troubleshooting

- "Secret storage is not configured": set `CREDENTIAL_ENCRYPTION_KEY`.
- Probe says provider rejected (HTTP 4xx): the stored value is wrong or was
  rotated at the provider without the retire step — rotate again.
- No live probe for a provider: expected — format check only; validate at the
  provider console, then mark the steps.
- Approval stuck on revoke: a *different* admin holding `secrets.revoke`
  decides in `/admin/approvals` within 24h; execution within 2h of approval.

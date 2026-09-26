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

## Creating a credential (field guide — the value is blind-pasted)

The create form shows the value back **once** (copy/download/dismiss) —
that single display is your chance to also paste it into the host env.
After dismiss, nobody (including you) can display it again except the
audited **Reveal** button. Fill the fields like this:

- **Secret value:** paste the provider-issued key (min 8 chars). The server
  encrypts on write; nothing echoes it back later.
- **Provider (free text, spelling matters):** probes match
  case-insensitive substrings. Spellings that unlock a live test:

  | Type exactly… | Live probe |
  |---|---|
  | `DeepL` (keys ending `:fx` auto-use the free host) | `/v2/usage` |
  | `Meta` / `Facebook` / `WhatsApp` | Graph `/me` |
  | `OpenAI` (bare word only) | `/v1/models` |
  | `Resend` | `/domains` |
  | `DeepSeek`, `Groq`, `OpenRouter` (any OpenAI-compatible host — see below) | format check only |
  | anything else (`SMTP`, `Supabase`, `R2`…) | format check only (`live: false`) |

  Anything else gets an honest format check — validate at the provider
  console, then mark the rotation steps by hand.

## Multi-value integrations: Meta and OpenAI-compatible LLMs

One vault row holds **one secret**. The app reads the rest from host env at
runtime — the vault is the rotation ledger, and Reveal is the handoff. Concretely:

**Meta / WhatsApp** (runtime reads `WHATSAPP_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID` from env):

1. Create one row: name `WhatsApp API token`, provider `WhatsApp`, paste the
   system-user token. Put the App ID + phone number ID in **notes** (they are
   not secret, but they belong with the rotation record).
2. **Test value** — the Graph `/me` probe accepts a valid token.
3. Reveal once → paste into Hostinger `WHATSAPP_TOKEN` → mark
   deployed/verified. Retiring = generating a new token at Meta, rotating
   here, updating env, confirming.

**LLM with 3 values** (runtime reads `LLM_API_KEY`, `LLM_BASE_URL`,
`LLM_MODEL` from env — only the key is secret):

1. Create one row: name e.g. `LLM API key (DeepSeek)`, provider `DeepSeek`
   (the provider's own name — see warning below), paste **only the key**.
   Put the base URL + model in **notes**, e.g.
   `base https://api.deepseek.com/v1, model deepseek-chat`. Only the key
   rotates; URL/model change via host env directly.
2. **Test value** → format check (honest `live: false`).
3. Reveal once → paste into Hostinger `LLM_API_KEY` (+ set `LLM_BASE_URL`,
   `LLM_MODEL` alongside it) → mark deployed/verified.

> Naming warning: never include the word "openai" for a compatible host
> (e.g. don't write `OpenAI-compatible (DeepSeek)`). The OpenAI live probe
> fires on that substring and would test your DeepSeek key against
> `api.openai.com`, falsely reporting it rejected. Name the actual provider.
- **Category:** fixed dropdown (`external_api` for provider keys, `email`,
  `storage`, `ai_service`, `webhook`, …) — organizational only.
- **Expiry + rotation interval:** set both (e.g. expiry 1 year, interval 90
  days). The Monday hygiene cron reads exactly these two fields — without
  them a credential is invisible to reminders.
- **Notes:** where the value is deployed (e.g. "Hostinger env
  `RESEND_API_KEY`, production") — future-you during a 2am rotation.

Never store `CREDENTIAL_ENCRYPTION_KEY` or `CRON_SECRET` as vault
credentials — they are host env; the vault cannot encrypt itself.

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
  Heartbeat grace 8 days — a missed Monday shows in the topbar's attention
  control (chief-filtered, like the Credentials tab itself) and in `/api/ready`.

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

# Security monitoring — reading the signals, answering them

**Where:** `/admin/security` (chief only). **Purpose:** the security lens over
the audit trail — failed logins, privilege changes, bulk/large operations,
critical transitions, credential lifecycle — plus CSV export and the alert
that fires when critical mode lights.

## The five lenses

| Lens | Window | What to do |
|---|---|---|
| Failed logins (heatmap + top identities/IPs) | 7 days | ≥5 attempts on one identity = credential-stuffing smell: check the timeline, then decide (below) |
| Suspicious: bulk / large (≥25 rows) / escalation / critical | 30 days | Large bulk + off-hours = verify with the actor; escalation you didn't approve = incident |
| Credential lifecycle | last 12 | Every rotation/validation/revocation — **including `revealed`**; an unexpected reveal is a same-day conversation |
| Timeline (5 category tabs + counts) | filterable | The full slice, exportable |
| Stats strip | — | Baselines at a glance; amber/red tones mark what needs eyes |

Identities are truncated HMACs, never emails; IPs land in metadata only in
request scope. Password logins, **OAuth landings** (`auth.mfa.challenge` kept
separate so the success baseline stays honest), blocks (throttle/captcha/ban)
and logouts all write `source='auth'` rows.

## Answering a signal (remediation runbook)

The page is read-only by design — remediation lives where its own guards are:

1. **Repeat logins on one identity:** open the timeline filtered to `auth`,
   confirm the window, ask the owner to rotate their password; if the account
   is staff, check `/admin/users` for role changes in the same window.
2. **Hostile IP:** block at the edge (CDN/WAF) — the app has no IP firewall;
   rate limiting already throttles auth (`auth:login` fail-closed).
3. **Compromised session:** user changes password (rotates session); staff
   account → suspend from `/admin/users` pending review.
4. **Unexpected credential event:** rotate immediately (Credentials runbook),
   validate, retire the old value at the provider.
5. **Critical mode:** resolve the incident in the console — activation pages
   staff automatically (`security.critical` alert) with a deep link.

## Alerts & automation

- `incident.critical_mode_activated` → `security.critical` staff alert
  (notification centre + digest channels) with the incident title + link.
- Scan caps (2,000 login rows, 200 suspicious) bound cost but truncate under
  attack volume — during an active incident, query the tables directly.
- No auto-throttle linkage: the page observes, the limiter enforces, the
  chief decides. Wire your edge alerting to page a human on the critical
  alert; nothing here pages on its own.

## Data model (for debugging)

No separate security table — security *is* the filtered trail:
`SECURITY_ACTIONS` vocabulary in `lib/admin/queries/security.ts` (one entry
per sensitive action; bulk matched by `%:bulk_%` pattern) + `credential_events`
for validation failures and retire confirmations the audit mirror never sees.
New sensitive action = one vocabulary line, and it appears in the tabs,
counts and export together.

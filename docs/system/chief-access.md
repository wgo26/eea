# Chief access — the supreme tier

The five **System & Infrastructure** tabs (Platform states, Credentials,
Storage & backup, Audit log, Security) are visible **only** to the Chief
Administrator. They concentrate platform-wide power — the state ladder,
plaintext-bearing key rotation, destructive storage cleanup, and the full
audit trail — so they sit above `admin` / `super_admin`, not beside them.

## The model

| Layer | What it is | Chief needs |
|---|---|---|
| Coarse `user_roles.role` | `admin` (or `editor`) — decides *staff* at all | one `admin` row |
| Fine `user_admin_roles.role` | `chief_admin` — unlocks `system.owner` + `secrets.reveal` | one `chief_admin` row |

- New capabilities: `system.owner` (gates all five tabs, their pages, exports
  and server actions) and `secrets.reveal` (gates the one-time plaintext
  reveal). Neither is granted to the legacy `admin` map, `super_admin`, or
  `platform_admin` — `ALL_CAPABILITIES` explicitly excludes them.
- Guards ask for **capabilities, never role names** (`requireCapability` on
  pages, `assertCapability` in actions). The sidebar, dashboard links, and the
  prioritized-actions feed all check `system.owner`, so a non-chief never sees
  a link to a page they cannot open.
- Admin reads use the service-role client (RLS bypass), but storage mutations
  still touch RLS-scoped reads — that is why the chief keeps the coarse
  `admin` row (`is_admin()`), alongside the `chief_admin` row.

## Granting chief access (runbook)

Grants are **SQL-only on purpose** — the supreme role is never click-grantable
from the users screen, so it cannot be reached by accident or by a compromised
staff session. Run in Supabase SQL with the user's auth id:

```sql
-- 1. Coarse staff gate (required for requireStaff + is_admin() RLS).
insert into public.user_roles (user_id, role)
values ('<auth-user-id>', 'admin')
on conflict do nothing;

-- 2. The supreme grant. No expiry = standing; prefer a dated grant and renew it.
insert into public.user_admin_roles (user_id, role, assigned_by, expires_at)
values ('<auth-user-id>', 'chief_admin', '<your-auth-user-id>', null);
```

Verify: sign in as that user — the sidebar shows the **System &
infrastructure** group. Revoke by deleting the `chief_admin` row (access ends
immediately; `getAdminRoles` also honours `expires_at`).

## What changes for existing admins

- `super_admin` / `platform_admin` keep everything **except** the five system
  tabs. They can still approve `secret.revoke` requests (two-person control
  needs a second admin holding `secrets.revoke`) and run the incident console.
- Operational states (`INCIDENT`/`CRITICAL`) stay incident-console-driven
  under `incidents.manage` — the states tab never was their door.
- If nobody holds `chief_admin` yet, the tabs are unreachable: grant it first
  (above), then rotate anything pending.

## Hardening checklist

- [ ] Exactly the people who may see plaintext hold `chief_admin` (aim: 1–2).
- [ ] Every chief has a verified TOTP factor enrolled — `secrets.reveal` and
      revocation demand an `aal2` session once a factor exists.
- [ ] `CREDENTIAL_ENCRYPTION_KEY` is set in production (else the Credentials
      tab degrades with a warning and create/rotate refuse).
- [ ] `CRON_SECRET` is set — all hygiene crons fail closed without it.
- [ ] Review `/admin/audit-log?actor=<id>` for each chief quarterly.

# Supabase Auth setup and operations

This runbook is the operational source of truth for local, staging, and production authentication. App authentication is implemented in `lib/auth/`, with browser-session checks, server-action authorization, and Postgres RLS as separate layers. Local Supabase configuration lives in `supabase/config.toml`; hosted Auth settings are managed independently in the Supabase Dashboard.

## System map

- **Identity provider:** Supabase Auth email/password and optional Google OAuth. Email confirmation is required. Password recovery completes through the root `/auth/callback` handler and returns to the user's locale-prefixed password-update page.
- **Sessions:** the Next.js proxy refreshes cookies only. It does not authorize routes. Protected pages/layouts call `lib/auth/guards.ts`; mutating server actions check roles/capabilities themselves.
- **Roles:** `admin`, `editor`, `contributor`, and `advertiser` live in `public.user_roles`. A member is an authenticated user with no role rows. New accounts receive the existing `contributor` role through the database trigger; do not change that behavior without a product-model decision.
- **MFA:** Supabase Auth TOTP factors are enrolled from account security settings. Only verified factors trigger login challenges; a password-only session with an enrolled factor is challenged at protected staff routes and server actions, and RLS denies its privileged branches until aal2. Disabling a verified factor requires a fresh six-digit code.
- **Profiles:** public browser grants are column-scoped. Contact data and account-control fields are read or changed through server-only service-role code after a guard. RLS remains enabled and is still required for browser-accessible rows.
- **Email delivery:** Supabase's built-in Auth email templates are used. The retired custom `send-auth-email` Edge Function and its database helper are not part of the supported delivery path.

## Required application environment

Copy `.env.example` to `.env.local` for local development and populate the Supabase URL, public anon/publishable key, and server-only service-role key for the project being used. `NEXT_PUBLIC_SITE_URL` must be the exact public origin (`http://localhost:3000` locally, the canonical HTTPS origin in production). Never prefix the service-role key with `NEXT_PUBLIC_`, expose it in client code, or reuse a production key locally.

Production also requires both `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; password reset, sign-in, and sign-up use the server-verified challenge. Configure the server-side rate-limit store required by this deployment before launch: those auth limits fail closed if persistent rate limiting is unavailable. App notification SMTP variables (`SMTP_*`) are for the app's own notifications; they do not configure Supabase Auth SMTP.

## Local development

1. Install the repository's pinned Node.js version (Node 22) and npm dependencies.
2. Set the local Supabase URL/key values in `.env.local`. Keep the local service-role key local.
3. Start the local Supabase stack with `npx supabase start`. It applies the project configuration and exposes Studio and the Inbucket test inbox; use the URLs printed by the CLI.
4. Start the app with `npm run dev`. The configured Auth Site URL is `http://localhost:3000`, and the allowlist includes local loopback origins on port 3000.
5. Open Inbucket after signup or password recovery to inspect the bilingual template and follow the link back through `/auth/callback`.
6. Run `node supabase/test-templates.mjs` to verify configured template files and their required Supabase variables.

`npx supabase db reset` drops and rebuilds the **local** database, applies every migration, then loads the local seed. It is destructive to that local database and must never be pointed at staging or production. Use `npm run test:rls` with an isolated disposable Postgres database for the migration/RLS harness; set `RLS_TEST_DATABASE_URL` only to that disposable database.

## Staging and production project setup

Complete this checklist separately for every hosted Supabase project. `supabase/config.toml` does not update hosted Dashboard settings.

### 1. Project and application keys

- Create separate Supabase projects for staging and production, with access limited to the operators who need it.
- Set the application's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the matching project. Keep the service-role key in the hosting provider's encrypted server environment only.
- Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS site origin; keep the `www` decision consistent with the site's canonical redirect.
- Configure `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for each environment, using the matching Cloudflare Turnstile site and allowed hostnames.
- Store an encrypted backup and verify the restore process before schema or Auth policy changes.

### 2. Auth URL and password policy

In **Authentication → URL Configuration**:

- Set **Site URL** to the canonical app origin, for example `https://eagleeyeafrica.org`.
- Add the exact root callback `https://eagleeyeafrica.org/auth/callback` to **Redirect URLs**. Add the canonical `www` callback only if that host is intentionally supported.
- Do not configure `/en/auth/callback` or `/fr/auth/callback`; the callback is a root route, and its `next` parameter carries the locale.
- Remove obsolete preview or non-HTTPS redirect entries. Add short-lived preview URLs only when a deployment needs them and remove them after use.

In **Authentication → Providers / Email**:

- Allow email/password signup and require email confirmation before sign-in.
- Set the minimum password length to **8**; the local config and signup UI use this minimum.
- Keep secure password change enabled and email-change confirmation enabled for both old and new addresses.
- Keep anonymous sign-in and phone/SMS signup disabled unless the product explicitly adopts and tests those flows.
- Configure Supabase's Auth rate limits for the expected workload. App-level login, signup, and password-reset protection is additional defense, not a replacement.

### 3. Email templates, sender, and deliverability

Configure all six bilingual files in `supabase/templates/` under **Authentication → Email Templates**: confirmation, recovery, magic link, invite, email change, and password-changed notification. Set the subjects shown in `supabase/config.toml`. Keep Supabase variables such as `{{ .ConfirmationURL }}`, `{{ .Email }}`, and `{{ .NewEmail }}` unchanged. Send a test message for each user-facing flow.

Configure a production custom SMTP sender in the Supabase Auth email settings, including sender name and verified sender address. Publish and test SPF and DKIM records for that sender domain, then publish DMARC (begin at monitoring policy if needed and move to enforcement after checking reports). Test delivery to multiple mailbox providers and verify spam placement, link validity, expiry, and both language blocks. This is distinct from the app notification sender configured with `SMTP_*`.

The supported path does not require an Auth email Edge Function. Before applying the cleanup migration, inspect **Authentication → Hooks** in the hosted Dashboard and disable any legacy custom email/database hook. The migration removes `extensions.send_auth_email`; remove any abandoned `send-auth-email` function and its old secrets from hosted project settings as a separate operator step. The `http` extension is left installed in case another hosted dependency uses it. Do not deploy the retired `--no-verify-jwt` endpoint.

### 4. OAuth (optional)

OAuth is opt-in and only appears when its provider is enabled in the app environment. For Google:

1. Create a separate OAuth client for each environment in Google Cloud Console.
2. Add the Supabase project's provider callback (`https://<project-ref>.supabase.co/auth/v1/callback`) to Google's authorized redirect URIs.
3. Add the Google client ID and secret to the Supabase project's **Authentication → Providers → Google** settings.
4. Add the matching Supabase URL to the app's Auth redirect allowlist, then set the app's OAuth provider flag for that environment.
5. Test first-time sign-in, existing-account sign-in, cancellation, callback errors, and locale-safe return paths. Do not put OAuth secrets in `NEXT_PUBLIC_*` variables.

### 5. Schema deployment and first administrator

Review pending migration diffs and take a restorable backup before applying them. Apply migrations in filename order using the repository's controlled Supabase CLI/CI migration process; do not edit or replay already-applied migration history. The new profile-privilege migration revokes table-wide browser access and grants only the safe column sets. It also removes the legacy Auth email helper. Hosted hooks must be disabled separately as above.

Bootstrap the first administrator only after the account has confirmed its email. Use a trusted operator with direct SQL Editor access and the exact Auth user UUID; never expose the service-role key to the browser:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('operator@example.org')
on conflict (user_id, role) do nothing;
```

Verify exactly one expected user received the role. The normal admin interface can then grant/revoke roles subject to its capability and reauthentication checks. Keep at least two independently controlled admin accounts, and never bootstrap an admin from public signup metadata or a client request.

## Verification checklist

Run in staging before production and again after every Supabase/Auth configuration change:

- [ ] New user can sign up, receives a confirmation email, and cannot sign in until confirmed.
- [ ] Confirmation returns through `/auth/callback` to the right locale and safe destination.
- [ ] Wrong password, unknown email, invalid redirect, blocked IP, rate limit, and failed Turnstile do not produce an authenticated session.
- [ ] Password recovery has indistinguishable success copy for existing and unknown emails, obeys the rate limit and Turnstile checks, and can set a new password once.
- [ ] Email change confirms both addresses; password-changed notification arrives.
- [ ] Google OAuth (if enabled) returns through the root callback and rejects unapproved return destinations.
- [ ] TOTP enrollment remains pending until a valid code verifies it; verified factors require a code at login; wrong codes fail; verified-factor removal requires a fresh code.
- [ ] Member, contributor, editor, and administrator route/action checks match the role/capability matrix.
- [ ] Browser roles cannot select profile email/phone or update status, verification, and curation columns; a user can still update only their approved own-profile fields.
- [ ] Anonymous and ordinary members cannot grant or alter `user_roles`; authorized staff operations still work.
- [ ] Run `npm run test:rls`, `npm run typecheck`, `npm run lint`, `npm run check`, and the auth-focused browser smoke flow before release.
- [ ] Confirm Supabase Auth logs, application audit events, Turnstile, rate-limit storage, and email delivery monitoring show no unexpected failures.

## Rollback and incident response

Do not roll back by editing an already-applied migration. If a migration causes an issue, pause deployment, preserve logs, restore only through the approved backup/restore process when data integrity requires it, and ship a forward corrective migration after review. For a compromised account, use the admin user-status action to ban/revoke sessions, rotate credentials, inspect Auth and audit logs, and verify the account's email and MFA factors. If an operator key is exposed, rotate it immediately in Supabase and every hosting environment, then invalidate the old key.

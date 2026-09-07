# Auth emails (Supabase)

Branded, bilingual (EN + FR) HTML templates for every Supabase Auth email live in
`supabase/templates/`:

| File | Supabase template | Subject |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirm your Eagle Eye Africa account / Confirmez votre compte |
| `recovery.html` | Reset password | Reset your Eagle Eye Africa password / Reinitialisez votre mot de passe |
| `invite.html` | Invite user | You've been invited to Eagle Eye Africa / Invitation a rejoindre Eagle Eye Africa |
| `magic_link.html` | Magic link | Your Eagle Eye Africa sign-in link / Votre lien de connexion |
| `email_change.html` | Change email address | Confirm your new Eagle Eye Africa email / Confirmez votre nouvel e-mail |
| `password_changed.html` | Notification: password changed | Your Eagle Eye Africa password was changed / Securite de votre compte |

Design notes:

- Table layout + inline CSS only (email-client safe), dark header with the gold
  brand accent, EN section first with FR below (`lang="fr"` on French blocks
  for screen readers), `color-scheme: light` meta against dark-mode inversion.
- Each template uses `{{ .ConfirmationURL }}`, `{{ .Email }}` / `{{ .NewEmail }}`
  — do not rename these variables; Supabase fills them at send time.
- Link-only flows on purpose: the app has no OTP-code entry UI (signup goes
  through `/auth/callback` into login, reset through the callback into the
  update-password form), so the templates show the button + a copy-paste link
  fallback and no `{{ .Token }}` code that would have nowhere to be entered.
- Subjects are ASCII-safe (no accented characters) so they survive
  misconfigured relays; the bodies carry the proper French accents.
- The "link expires in 1 hour" copy matches `otp_expiry = 3600` in
  `config.toml` — if you change the expiry, update the templates too.

## Local dev (`supabase start`)

`supabase/config.toml` already points each `[auth.email.template.*]` and
`[auth.email.notification.password_changed]` at these files, and
`additional_redirect_urls` lists local + production `/auth/callback` URLs.
Mailpit (the local testing inbox) shows the rendered emails.

## Production (hosted Supabase — required manual steps)

`config.toml` does **not** apply to the hosted project. Three things to do in
the Dashboard:

1. **Email Templates** (Authentication → Email Templates): for each of the six
   rows above, copy the matching file from `supabase/templates/` into the
   content editor and set the subject. Include the
   Password-changed notification — account-takeover notices are the template
   teams most often forget.
2. **URL Configuration** (Authentication → URL Configuration): set Site URL to
   `https://eagleeyeafrica.org` and add Redirect URLs for
   `https://eagleeyeafrica.org/auth/callback` (and `www.` if used). Email links
   that aren't allow-listed are rejected, so password resets silently break
   without this.
3. **Custom SMTP** (Project Settings → Auth / SMTP): Supabase's built-in mailer
   is rate-limited test mail. Configure a production sender (e.g. SendGrid,
   Resend, SES) with SPF/DKIM before launch, or signup confirmations and
   password resets will throttle or land in spam.

Afterwards, send yourself a test signup + password reset (in both locales) and
confirm the links land on `/auth/callback` and return to the right locale.

Notes:

- The app already sends locale-aware `emailRedirectTo` / `redirectTo`
  (`signup-form.tsx`, `reset-request-form.tsx`), so the link lands back in the
  user's language. Supabase templates are single-version per project, hence
  one bilingual template rather than per-locale templates.
- `minimum_password_length = 6` matches the `minLength={6}` + hint copy in the
  signup form — keep the three in sync.
- When editing templates, keep the file + the `config.toml` wiring + this doc
  in the same PR.

# Supabase Auth email templates

Supabase's built-in Auth email delivery is the only supported account-email path. The six bilingual templates live in `supabase/templates/` and are wired for local development in `supabase/config.toml`:

| File | Supabase template |
|---|---|
| `confirmation.html` | Confirm signup |
| `recovery.html` | Reset password |
| `invite.html` | Invite user |
| `magic_link.html` | Magic link |
| `email_change.html` | Change email address |
| `password_changed.html` | Password-changed notification |

Templates use Supabase's built-in variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`, and `{{ .NewEmail }}`). Keep them intact. The bilingual body is one template per Supabase project because the Auth template editor stores one version for every recipient.

For local development, start Supabase and inspect delivered messages in Inbucket. Run `node supabase/test-templates.mjs` to check that every configured template file and required variable is present.

Hosted project configuration is separate from `config.toml`: copy the same six templates and subjects into **Authentication → Email Templates**, configure custom Auth SMTP, and verify SPF, DKIM, and DMARC. The sender configured in Supabase Auth is separate from app notification SMTP (`SMTP_*`).

The retired custom email Edge Function is not required and must not be redeployed. Before applying the cleanup migration to a hosted project, disable any legacy Auth hook in **Authentication → Hooks**, remove its hosted function/secrets, then apply migrations using the normal controlled process.

See [the complete Supabase Auth setup and verification runbook](./supabase-auth-setup.md) for URL allowlists, password policy, OAuth, MFA, profile grants, role bootstrap, rollout, and incident response.

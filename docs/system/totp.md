# Two-factor authentication (TOTP) — flow guide

TOTP is Supabase Auth MFA. Three flows: enroll once, challenge on every
login after that, and automatic step-up for the most sensitive actions.

## 1. Enroll (one time) — `/account/security`

1. Open your account's security section and start enrollment.
2. The app (`enrollMfa()` in `lib/auth/mfa.ts`) shows a **QR code + secret**.
   Scan it into an authenticator app (Google/Microsoft Authenticator,
   1Password, …). **Save the secret offline** — it is the only recovery if
   you lose the phone; there is no admin reset for it.
3. Enter the current 6-digit code (`verifyMfaEnrollment()` activates the
   factor). Until verified, the factor exists but enforces nothing. You can
   remove it later (`unenrollMfa()`), which the audit trail records.

## 2. Login challenge (every sign-in after enrollment)

1. Email + password as usual → the app checks the assurance level
   (`needsMfaChallenge()`).
2. With a verified factor enrolled, the password step yields only an `aal1`
   session — you are redirected to `/account/mfa-challenge` (destination
   preserved in `next`).
3. Enter the 6-digit code (`verifyMfaChallenge()`) → session upgrades to
   `aal2` → you land where you were going.
4. The trail records `auth.mfa.challenge` for this step, kept separate from
   `auth.login.succeeded` so the security success baseline stays honest.

No factor enrolled = no challenge; login behaves exactly as before.

## 3. Step-up (where it protects the system group)

Once a factor is enrolled, two gates engage on their own:

- `assertTwoFactorIfEnrolled` — secret **reveal** and **revocation**: with no
  code entered *this session*, both refuse even though you are logged in. A
  stolen password alone can neither read nor kill keys.
- `assertTwoFactor` — destructive admin ops (suspend, ban, deletion, role
  changes) demand a fresh `aal2` session.

This is why the chief-access checklist requires TOTP on every chief account:
the supreme tier is only supreme when a password is not enough.

## Troubleshooting

- Codes always fail: check the phone's clock first (TOTP is time-based, 30s
  window); then re-enroll.
- Lost phone, no saved secret: there is no self-recovery — another chief
  cannot reset it either. Treat the enrollment secret like a password:
  store it before you need it.
- Challenge loop after login: the session never reached `aal2` — complete
  the code step instead of re-entering the password.

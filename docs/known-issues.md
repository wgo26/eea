# Known issues & debt (regenerated 2026-09-10)

Living debt list verified against the current code. The old `m.md` /
`implementation_plan.md` / `scaffold_plan.md` (archived under `docs/history/`)
list many items that were **already fixed** — do not chase them. This file is
the source of truth.

## Already fixed (do not re-implement)

- Ads: slots/advertisers/campaigns have real Dialogs (incl. `updateAdSlot` /
  `deleteAdSlot` wired); no `window.prompt/confirm/alert` in ads or users.
- Content: per-item + bulk publish/archive/delete; pagination (20/s), status
  + type filters, search (q).
- Moderation: paginated + searchable queue (no more 5×1000 merge), status
  scoping, deep links.
- Media: `MediaUploader` (drag-drop + thumbnail strip + alt/caption) wired
  into content dialogs, review drawer, and public submit (signed-in users;
  guests keep the URL textarea). Media library (`/api/admin/media-search`) +
  `MediaPicker` now render inside the standard `Dialog`.
- Taxonomy: per-translation edit, reassign, delete-or-block.
- Site logo: upload + URL (feeds header/footer + the browser-tab icon).
- Storage: per-asset table + verify + admin delete.
- Audit log: select/date filters + CSV export; inputs labelled.
- Homepage slots: assign/search/toggle/reorder/delete + thumbnails.
- Defensive infra: durable rate limits, Turnstile, honeypot, upload ownership
  checks, security headers, health/ready endpoints, cron scheduler,
  `verify-clean`, `verify-backup`, migration gates.
- Social cards: default og:image for every route (1200×630, `public/og-default.png`).

## P1 — fix soon (visible gaps)

1. **No real notification loop.** New submission / ad inquiry / legal-inbox
   item produces no email. The nightly ops-digest webhook (`DIGEST_WEBHOOK_URL`)
   tells staff *there is* work; per-event email (Resend/SES via a cron route)
   is the next step beyond that.
2. **Listings have no dedicated admin edit surface.** Price/photos/seller are
   edited through the generic content dialog; `/admin/listings` has no bridge
   link and no public "manage my listing" page for sellers.
3. **Users admin is thin.** No profile/name/email edit UI,
   `updateContributorCuration` orphaned (zero UI imports). Contributors create
   content/polls/fundraisers rows they cannot delete, with no explanation in
   the UI.
4. **Public image pipeline is partial.** Several public cards/galleries still
   use plain `<img>` (some with a stale "not in remote patterns" comment — the
   patterns are env-driven now); migrate to `next/image` for LCP.
5. **No document uploads/video anywhere.** Schema supports `kind` but no UI
   path exists for documents or video (upload or embed).

## P2 — schedule, don't panic

- Monoliths: `lib/admin/actions.ts` (~50 actions), `lib/admin/queries.ts`
  (~2,000 lines) → split per-domain.
- Tests: 63 vitest unit tests but **no RLS/integration, no component, no e2e**.
  Highest-value next: "editor cannot delete" RLS integration test + a smoke
  e2e for the submit→moderate→publish loop.
- CSP: `script-src 'unsafe-inline' 'unsafe-eval'`, wildcard img/connect-src —
  strict-nonce CSP is the target (big effort, low urgency for v1).
- `console.error` stragglers (4 in `lib/admin/queries.ts`, 1 in
  `lib/auth/roles.ts`) bypass `logger` — migrate for consistent JSON logs.
- Bootstrap: `unstable_cache` (documented choice) — re-audit on Next 17.
- Notifications parity: digest exists; email needs SMTP/scoped per-event sends.
- Dependabot/Renovate + `npm audit` step not configured.
- No `.gitattributes` — CRLF/LF churn on Windows contributors.
- Public go-live checklist item "verify WhatsApp link preview" is unverified
  in production.

## Ops notes (pre-launch)

- Run `node scripts/teardown-demo.mjs` + `npm run verify:clean` before go-live
  (or intentionally keep seed content — decide and document).
- Configure production SMTP (Supabase custom SMTP) + verify SPF/DKIM/DMARC.
- Set `CRON_SECRET`, `SENTRY_DSN`, `DIGEST_WEBHOOK_URL` on the host; wire
  `docs/observability.md` §3 (uptime monitor against `/api/ready`).
- Add a `pg_dump` → B2 job + rehearse a restore (media mirrors exist, DB backup
  does not).

Keep this file in sync with reality — delete items as they land.
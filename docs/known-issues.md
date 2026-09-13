# Known issues & debt (regenerated 2026-09-13)

Living debt list verified against the current code. The old `m.md` /
`implementation_plan.md` / `scaffold_plan.md` (archived under `docs/history/`)
list many items that were **already fixed** — do not chase them. This file is
the source of truth. (A short-lived root `TODO.md` duplicated this file and
was deleted — do not recreate it.)

## Already fixed (do not re-implement)

- Ads: slots/advertisers/campaigns have real Dialogs (incl. `updateAdSlot` /
  `deleteAdSlot` wired); no `window.prompt/confirm/alert` in ads or users.
- Ads formats: image/video/audio/html/sponsored creatives with mobile/desktop
  assets, posters, creative moderation (`creative_status` gate), responsive
  `AdSlot` rendering, impression/click beacons (`/api/ads/event`), date-window
  serving (`lib/queries/ads.ts`), detail-page rails (`news-rail`,
  `photo-story-rail`, `buy-sell-inline`).
- Content: per-item + bulk publish/archive/delete; pagination (20/s), status
  + type filters, search (q).
- Moderation: paginated + searchable queue (no more 5×1000 merge), status
  scoping, deep links; review screen plays video/audio payload links.
- Media: `MediaUploader` (drag-drop + thumbnail strip + alt/caption, per-kind
  accepts + size caps + browser duration probe → `duration_seconds`) wired
  into content dialogs, review drawer, public submit and ad creatives.
  Media library (`/api/admin/media-search`) + `MediaPicker` support
  image/video/audio/document with duration badges.
- Content intake: photo-story/news/culture/notice/listing forms accept
  supporting video + audio (upload for signed-in, `https://`-validated URL
  lists for guests); `videos`/`audios` payload fields enforced by DB trigger.
- **Document (PDF) upload path (P1-4):** public intake adds a `documents`
  field (upload for signed-in, URL list for guests), payload allowlist +
  normalization in `lib/public/actions.ts`, DB trigger allowlist extended
  (`20261001000003_submission_documents.sql`), moderation review prefills +
  publishes documents as `kind: 'document'` attachments, and detail pages
  already render a download card (`MediaAttachmentView`).
- Public display: `MediaAttachment`/`SupportingMedia` players on news,
  photo-story, culture, notice and listing detail pages; Video/Audio badges
  on cards and search.
- **Public image pipeline (P1-3):** photo-story `gallery-grid` (cover + LCP),
  the site-footer logo and image attachments now render through
  `SmartImage` — next/image (optimized) for our own storage hosts, plain
  lazy `<img>` fallback for pasted external URLs. The stale
  "not in remote patterns" comment is gone (the patterns are env-driven,
  `next.config.ts`).
- **Low-bandwidth media pass:** every editorial image in the app now renders
  through `SmartImage` — the last 7 CSS `backgroundImage` surfaces
  (contributor avatars + portfolio cards, culture article/event heroes,
  event cards) migrated with slot-matched `sizes`; AVIF-first negotiation
  enabled (`images.formats`); upload masters re-encoded to q82 WebP capped
  at 2560px (PNG stays lossless) instead of JPEG q85/4000px.
  `scripts/find-bg-images.mjs` (in `npm run check` + CI) blocks regression.
- Notifications: per-event loop is live — `notification_outbox` queue +
  `notification_prefs`, `/api/cron/notify` every 15 min, in-app inbox with
  topbar badge (`/account/notifications`), SMTP email, WhatsApp Cloud API
  (opt-in), `/admin/notifications` manager (queue, channel status, test
  sends, retries, digest subscribers), `manageNotifications` capability.
  Ops-digest schedule fixed (fires `0 6 * * *`); `password_changed` template
  path fixed. See `docs/notifications.md`.
- Notifications completion (A–E): guest one-off SMTP receipts
  (`lib/notify/guest-receipts.ts`, explicit anti-spam policy in
  `docs/notifications.md`); public digest signup at `/digest` + 06:00
  subscriber fan-out in `/api/cron/ops-digest`; self-service phone +
  alert-language in profile/prefs (worker fallback stays consistent);
  per-recipient quiet hours (`quiet_start/quiet_end`, Africa/Douala,
  email/WhatsApp held, in-app always); WhatsApp utility-template fallback
  on 24h-window error 131047 (`WHATSAPP_TEMPLATE/_LANG`) + template-first
  digest sends; admin per-row retry + `wa.me`/copy-text manual follow-up +
  per-channel test summaries; `npm run notify:env` pre-launch checker.
- Notifications follow-through: per-locale utility templates
  (`WHATSAPP_TEMPLATE_FR`, French recipients auto-routed,
  `docs/whatsapp-template.md` submission pack with exact EN+FR bodies);
  90-day outbox retention prune inside the worker; `scripts/seed-notify.mjs`
  dev seed (+ teardown) for the loop; operator section in
  `docs/admin-manual.md`.
- Taxonomy: per-translation edit, reassign, delete-or-block.
- Site logo: upload + URL (feeds header/footer + the browser-tab icon).
- **Listings admin surface (P1-1):** dedicated `/admin/listings` manager with
  a details dialog for price/currency/seller/contacts, lifecycle actions
  (expire/relist/sold/remove), a bridge link from the Content table, and a
  public seller "manage my listing" page at `/account/listings`.
- **Users admin (P1-2):** profile edit dialog (display/full name, phone) via
  `updateUserProfile`, contributor curation (featured + bio override) wired
  into the user detail page, role manager with password reauth, status
  controls, activity deep-links and a delete danger zone. Delete buttons
  remain admin-only; screens now explain that to non-admin staff
  (`deleteAdminOnly` hint on Content/Polls/Fundraisers).
- **Homepage curation (Content → Homepage tab):** slot-key picker limited to
  the two keys the homepage actually renders (`hero` + `secondary`), optional
  display windows (`starts_at`/`ends_at` set at create or via
  `updateHomepageSlotWindow`), live/scheduled/expired state chips, and a
  "View homepage" preview link.
- Storage: per-asset table + verify + admin delete.
- Audit log: select/date filters + CSV export; inputs labelled.
- Homepage slots: assign/search/toggle/reorder/delete + thumbnails.
- Defensive infra: durable rate limits, Turnstile, honeypot, upload ownership
  checks, intake URL allowlisting, security headers, health/ready endpoints,
  cron scheduler, `verify-clean`, `verify-backup`, migration gates.
- Social cards: default og:image for every route (1200×630, `public/og-default.png`).
- Repo hygiene: `.gitattributes` (`text=auto eol=lf`) exists; scratch
  investigation files are excluded from eslint.
- Lint: zero errors (one pre-existing `Mail` unused-import warning in
  `notice-card.tsx`).
- **Structured logs (P2):** the `console.error` stragglers are migrated — the
  four in `lib/admin/queries.ts` use `logger.error`
  (`lib/observability/logger.ts`), and `lib/auth/roles.ts` emits the same
  JSON record shape inline (it is also imported client-side, so the
  server-only logger can't be imported there).
- **Dependency hygiene (P2):** `.github/dependabot.yml` (weekly npm, monthly
  GitHub Actions, grouped dev updates) + an advisory `npm audit
  --audit-level=high` step in `ci.yml`.

## P1 — fix soon (visible gaps)

1. **WhatsApp link-preview verification in production is unverified.**
   Canonical/hreflang/OG tags ship per page, but nobody has checked a real
   WhatsApp render of a story link — run the handset steps in
   `docs/notifications.md` §production checklist. (Manual/ops only — no code
   change.)

## P2 — schedule, don't panic

- Monoliths: `lib/admin/actions.ts`, `lib/admin/queries.ts` (~2,000+ lines
  each) → split per-domain.
- Tests: 97+ vitest unit tests but **no RLS/integration, no component, no e2e**.
  Highest-value next: "editor cannot delete" RLS integration test + a smoke
  e2e for the submit→moderate→publish loop (which now also covers the
  notification outbox).
- CSP: `script-src 'unsafe-inline' 'unsafe-eval'`, wildcard img/connect-src —
  strict-nonce CSP is the target (big effort, low urgency for v1).
- Bootstrap: `unstable_cache` (documented choice) — re-audit on Next 17.

## Ops notes (pre-launch)

- Run `node scripts/teardown-demo.mjs` + `npm run verify:clean` before go-live
  (or intentionally keep seed content — decide and document).
- Configure production SMTP (Supabase custom SMTP **and** app `SMTP_*` — same
  host) + verify SPF/DKIM/DMARC.
- Set `CRON_SECRET`, `SENTRY_DSN`, `DIGEST_WEBHOOK_URL`, `SMTP_*`,
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`
  (+`_LANG`) on the host — pre-check with `npm run notify:env`; wire
  `docs/observability.md` §3 (uptime monitor against `/api/ready`).
- Apply migrations (`supabase db push` — includes the notifications/ads-format
  batch and `20261001000003_submission_documents.sql`). Verify with
  `scripts/verify-migrations.mjs`.
- Run the handset + receipt steps in `docs/notifications.md` §production
  checklist (guest receipt in-inbox, WhatsApp test on a real handset with
  reply-to-open-window, story-link OG card render).
- Add a `pg_dump` → B2 job + rehearse a restore (media mirrors exist, DB backup
  does not).

Keep this file in sync with reality — delete items as they land.

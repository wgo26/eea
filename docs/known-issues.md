# Known issues & debt (regenerated 2026-09-11)

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
- Public display: `MediaAttachment`/`SupportingMedia` players on news,
  photo-story, culture, notice and listing detail pages; Video/Audio badges
  on cards and search.
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

## P1 — fix soon (visible gaps)

1. **Listings have no dedicated admin edit surface.** Price/photos/seller are
   edited through the generic content dialog; `/admin/listings` has no bridge
   link and no public "manage my listing" page for sellers.
2. **Users admin is thin.** No profile/name/email edit UI,
   `updateContributorCuration` orphaned (zero UI imports). Contributors create
   content/polls/fundraisers rows they cannot delete, with no explanation in
   the UI.
3. **Public image pipeline is partial.** Several public cards/galleries still
   use plain `<img>` (including the stale "not in remote patterns" comment in
   `gallery-grid.tsx` — the patterns are env-driven now, see `next.config.ts`);
   migrate to `next/image` for LCP. New ad-creative and media thumbnails join
   the list.
4. **No document upload path.** Schema supports `document` kind and the picker
   filters it, but no UI uploads or embeds PDFs yet (video/audio are done).
5. **WhatsApp link-preview verification in production is unverified.**
   Canonical/hreflang/OG tags ship per page, but nobody has checked a real
   WhatsApp render of a story link — run the handset steps in
   `docs/notifications.md` §production checklist.

## P2 — schedule, don't panic

- Monoliths: `lib/admin/actions.ts`, `lib/admin/queries.ts` (~2,000+ lines
  each) → split per-domain.
- Tests: 97 vitest unit tests but **no RLS/integration, no component, no e2e**.
  Highest-value next: "editor cannot delete" RLS integration test + a smoke
  e2e for the submit→moderate→publish loop (which now also covers the
  notification outbox).
- CSP: `script-src 'unsafe-inline' 'unsafe-eval'`, wildcard img/connect-src —
  strict-nonce CSP is the target (big effort, low urgency for v1).
- `console.error` stragglers (4 in `lib/admin/queries.ts`, 1 in
  `lib/auth/roles.ts`) bypass `logger` — migrate for consistent JSON logs.
- Bootstrap: `unstable_cache` (documented choice) — re-audit on Next 17.
- Dependabot/Renovate + `npm audit` step not configured.

## Ops notes (pre-launch)

- Run `node scripts/teardown-demo.mjs` + `npm run verify:clean` before go-live
  (or intentionally keep seed content — decide and document).
- Configure production SMTP (Supabase custom SMTP **and** app `SMTP_*` — same
  host) + verify SPF/DKIM/DMARC.
- Set `CRON_SECRET`, `SENTRY_DSN`, `DIGEST_WEBHOOK_URL`, `SMTP_*`,
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`
  (+`_LANG`) on the host — pre-check with `npm run notify:env`; wire
  `docs/observability.md` §3 (uptime monitor against `/api/ready`).
- Apply migrations (`supabase db push` — includes `20260928000000_ads_formats`,
  `20260929000000_notifications` and `20260930000000_notification_quiet_hours`).
- Run the handset + receipt steps in `docs/notifications.md` §production
  checklist (guest receipt in-inbox, WhatsApp test on a real handset with
  reply-to-open-window, story-link OG card render).
- Add a `pg_dump` → B2 job + rehearse a restore (media mirrors exist, DB backup
  does not).

Keep this file in sync with reality — delete items as they land.

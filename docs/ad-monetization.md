# Ad monetization — publisher runbook (PropellerAds / Monetag, AdSense, combinations)

This is the operating manual for turning on third-party advertising on Eagle Eye
Africa, from creating the network account to reading the revenue numbers. It is
written against the code that already ships: the first-party campaign engine
(`ad_slots` / `advertisers` / `ad_campaigns`, `/admin/ads`, `/api/ads/event`)
plus the remnant layer added for networks (`lib/ads/networks.ts`,
`components/ads/network-ad.tsx`, `/ads.txt`).

Read the whole document before the first deploy: stages 4–6 are the ones that
turn revenue into a performance, policy or trust incident when skipped.

---

## 0. The model in one paragraph

A placement renders **one thing, in this order**:

1. **Sold inventory** — the newest active first-party campaign for that slot
   (`lib/queries/ads.ts`, `creative_status = 'approved'`), priced and invoiced in
   `/admin/ads`.
2. **Remnant network inventory** — a third-party tag configured for that slot
   key in `/admin/ads` (or `NEXT_PUBLIC_AD_SLOTS` as bootstrap), loaded only
   after cookie consent.
3. **Nothing** — no placeholder, no empty box, no layout gap.

That order is the product decision: direct sales earn more per impression and
keep the advertiser relationship local, so a network tag must never displace a
sold campaign. It is enforced in one line of `components/home/ad-slot.tsx`.

Where things live:

| Concern | File |
|---|---|
| Slot inventory, watermark rules, cache tag `ads` | `lib/queries/ads.ts` |
| Creative validation / sanitizing (first-party) | `lib/ads/creatives.ts` |
| Network config parsing + placement keys | `lib/ads/networks.ts` |
| Network tag rendering, consent gate, lazy load | `components/ads/network-ad.tsx` |
| Live network config (Postgres → context) | `lib/queries/ad-networks.ts` → `components/ads/ad-runtime-provider.tsx` |
| Admin screen for networks | `app/[locale]/(app)/admin/ads/network-tab.tsx`, `lib/admin/actions/ad-networks.ts` |
| House ad / unfilled placement | `components/ads/house-ad.tsx` |
| Consent flag (shared with the cookie banner) | `lib/consent.ts` |
| CSP allowlist derived from the same config | `lib/security/csp.ts` |
| `ads.txt` endpoint | `app/ads.txt/route.ts` |
| Impressions/clicks beacon + fraud damping | `app/api/ads/event/route.ts` |
| Admin queue, approvals, billing | `app/[locale]/(app)/admin/ads/page.tsx`, `lib/admin/actions/ads.ts` |

---

## Stage 1 — Platform registration and verification

Do this first, in parallel across two networks. Nothing in the codebase needs to
change for any of it.

### 1a. Choose the mix, not the network

| Network | Best at | Trade-off |
|---|---|---|
| **PropellerAds / Monetag** | Fill in low-CPM geos (Cameroon included), popunder, in-page push, vignette; weekly payouts from small balances | Popunder/notification formats are intrusive — readers notice; keep them off article bodies |
| **Google AdSense** | Brand-safe display/native banners, advertiser demand | Strict content/UX policy, $100 payment threshold, PIN/address verification, harder payout rails for some African markets |
| **Google Ad Manager** | Combining direct-sold + AdSense + other demand with floors and priorities | Approval + setup overhead; only worth it once direct sales are consistent |
| **Adsterra / Ezoic / others** | Extra fill, alternative payouts | Another script, another policy surface, another 100–300 KB of JS |

Recommended sequence for this site: **Monetag/PropellerAds for remnant fill
first** (fast approval, low threshold, works in XAF-adjacent markets), **AdSense
once there is steady organic traffic and a clean content record**, and **Ad
Manager only after direct sales justify the plumbing**.

### 1b. Registration checklist (both networks)

1. Create a **publisher account** (not an advertiser account) with a company or
   personal identity you can verify.
2. **Add the website**: `https://eagleeyeafrica.org` (plus any custom domain).
3. **Verify ownership** — the network offers a meta tag, an HTML file in the web
   root, or a DNS TXT record. Prefer, in this order:
   - **DNS TXT** — no code change, survives redeploys.
   - **`/ads.txt`** (AdSense accepts it) — the endpoint already exists, so you
     paste the record into `ADS_TXT_LINES` and reload the URL (it is
     request-time; no deploy needed).
   - **Meta tag** — requires a change in `app/[locale]/layout.tsx`; avoid unless
     the network offers nothing else.
4. **Site review / moderation.** Reviewers look at: content originality, traffic
   quality, policy pages (`/about/privacy`, `/about/terms`, `/about/guide`),
   contactability, and whether ads would sit on empty or error pages. Expect
   hours-to-days. Rejection is usually fixable and re-reviewable.
5. **Complete tax/KYC and payout details** before earning — many networks hold
   revenue until the payout profile is verified. Confirm the method actually
   works for your country and currency before you plan on the cash.
6. Note the **payment threshold, schedule, currency and fees** in your ops notes.

### 1c. Account hygiene that later stages depend on

- Store the network login in the team password manager, **never** in `.env`.
- The only network data that belongs in this repository is **public client-side
  configuration** (tag URLs, zone ids, publisher ids) and **`ads.txt` records**.
  Reporting API keys are server secrets → the credential vault
  (`/admin/settings/secrets`, `lib/security/credential-manager.ts`), not env.
- Keep one zone per placement family (`homepage-banner`, `news-rail`, …). One
  giant "website" zone makes revenue per placement unmeasurable.
---

## Stage 2 — Design the slot inventory (before touching config)

Inventory is a product decision; the code only enforces it.

### 2a. Placement map

The canonical placement keys are `AD_PLACEMENTS` in `lib/ads/networks.ts`, and
every public page already passes one to `AdSlot`:

| Placement key | Page | Shape | Suggested network format |
|---|---|---|---|
| `homepage-banner` | `/` (under hero) | leaderboard | banner (970×250 / 320×100) |
| `homepage-rail-top` | `/` sidebar | tall rail | banner 300×600 or in-page push |
| `homepage-inline-mid` | `/` mid river | slim band | banner 728×90 / native |
| `homepage-inline-bottom` | `/` (reserved) | slim band | banner |
| `news-index-rail` | `/news` sidebar | tall rail | banner 300×250 |
| `news-rail` | `/news/[slug]` sidebar | tall rail | banner 300×250 |
| `photo-story-index-rail` | `/photo-stories` | tall rail | banner |
| `photo-story-rail` | `/photo-stories/[slug]` | tall rail | banner 300×600 |
| `notices-index-rail` / `notices-rail` | `/notices`, `/notices/[id]` | tall rail | banner |
| `culture-rail` | `/culture` | tall rail | banner |
| `buy-sell-index-rail` / `buy-sell-inline` | `/buy-sell`, `/buy-sell/[id]` | rail / band | banner, native |
| `contributor-rail` | `/contributors/[id]` | band | native / smartlink |

Add a new placement only by (a) adding the key to `AD_PLACEMENTS`, (b) passing
`slotKey={AD_PLACEMENTS.…}` at the call site, and (c) optionally inserting the
matching row in `ad_slots` so direct sales can target it too.

### 2b. Density rules (self-imposed, and they are the brand)

- **At most one boxed unit per viewport** on mobile; rails count as one.
- **Never** inside the article body between the headline and the first
  paragraph — that is where LCP lives and where trust is decided.
- **Never** on `/auth/*`, `/account/*`, `/admin/*`, `/submit/*`, `/offline`,
  `/not-authorized`, `not-found`, or any `(focused)`/`(app)` route. Those shells
  are `noindex`, gated, and ad scripts there are wasted impressions plus a
  policy risk. Network impressions are wired only into `(public)` pages.
- Page-level formats (popunder, vignette, push) are **one per session**, never
  stacked, and never on the homepage first visit. PropellerAds/Monetag
  "MultiTag" is the supported way to let the network choose between them.
- Ad label is mandatory and already rendered (`dict.home.advertisement` →
  "Advertisement" / "Publicité"). Do not hide it to improve CTR: it is both an
  AdSense requirement and the features.md rule that paid placement stays
  visibly separate from editorial.
---

## Stage 3 — Configure it (admin screen first)

### 3a. Live config: `/admin/ads` → Networks

Network configuration lives in Postgres and is edited in the admin, not in env:

- **`ad_network_settings`** (one row) — `networks_enabled`, `consent_required`,
  `reserve_space`, `house_ads_enabled`.
- **`ad_slots.network_*`** — one tag per placement: provider, format,
  https tag URL, box size, AdSense client/slot, active flag.

`lib/queries/ad-networks.ts` reads both on the server (cached under the `ads`
tag, 5-minute backstop), and `app/[locale]/(public)/layout.tsx` hands the result
to the client renderer through `AdRuntimeProvider`. A change is therefore live on
the next public render — **no rebuild, no deploy**. Every save is validated by
the same parser the renderer uses (`adUnitFromRow` → `parseUnit`) and by the
migration's check constraints, audited, and busts the `ads` cache.

Apply the migration first:

```powershell
supabase db push            # or your migration runner of choice
npm run types:db            # regenerates lib/supabase/database.types.ts
```

### 3b. Environment variables (bootstrap / fallback only)

These are used **only when the database has no network rows** (fresh install,
local dev without a DB, migration not applied). They are baked at build time, so
editing one needs a rebuild — prefer the admin screen.

```dotenv
# One entry per placement key. url = the tag URL from the network dashboard.
NEXT_PUBLIC_AD_SLOTS={"homepage-banner":{"network":"monetag","format":"banner","url":"https://TAG-HOST/XXXX/invoke.js","height":250},"news-index-rail":{"network":"monetag","format":"in-page-push","url":"https://TAG-HOST/XXXX/invoke.js"}}

# Ops kill switch (leave unset for "on when configured").
NEXT_PUBLIC_ADS_ENABLED=

# Consent gate. Default ON — do not disable without a legal decision.
NEXT_PUBLIC_AD_CONSENT_REQUIRED=

# ads.txt records, one per line (verbatim from each dashboard).
ADS_TXT_LINES="propellerads.com, <publisher-id>, DIRECT\ngoogle.com, pub-<publisher-id>, DIRECT, f08c47fec0942fa0"
```

Notes:

- `format` drives behaviour: `banner | native | adsense` reserve a box; the
  page-level formats (`popunder`, `push`, `in-page-push`, `interstitial`,
  `vignette`) inject and reserve nothing; `smartlink` renders a labelled link.
- `url` **must be `https:`** — an `http:`/`javascript:` value is dropped, and so
  is a malformed JSON blob. The failure mode is always "no ad", never a broken
  page.
- `attributes` (optional) accepts `data-*` keys only, for tags that need
  `data-zone` / `data-slot`.
- The CSP is **deployment configuration**, not runtime database configuration.
  `lib/security/csp.ts` includes origins from `NEXT_PUBLIC_AD_SLOTS` and
  `CSP_AD_EXTRA_HOSTS` in `script-src`, `frame-src`, `img-src` and
  `connect-src`; AdSense serving origins are included by default. Before saving
  a database-backed tag in `/admin/ads`, its loader origin must already be
  allowed by the deployed CSP. The admin screen rejects a tag whose loader
  origin is not allowed. Add new origins to `CSP_AD_EXTRA_HOSTS` and redeploy;
  add any additional creative/frame/API hosts there too if the browser reports
  CSP violations. Do not edit the generated policy directly.
- Removing a bootstrap network from the JSON removes its origins from CSP on
  the next build. Remove any no-longer-needed manual `CSP_AD_EXTRA_HOSTS` entry
  separately when decommissioning a vendor.

### 3b. `ads.txt`

`app/ads.txt/route.ts` serves `ADS_TXT_LINES`, one validated record per line,
and answers even when the variable is empty (an empty file is valid; a 404 is
not). Copy each record verbatim from the network dashboard; the route drops
lines that are not `domain, publisher-account, DIRECT|RESELLER[, cert-id]`.

This route is `force-dynamic` on purpose: it reads the variable **per request**,
so adding a record is "edit the env var, reload the URL" — no rebuild. (The
`NEXT_PUBLIC_*` variables above are different: they are inlined at build time.)

Verify after deploy:

```powershell
curl.exe https://eagleeyeafrica.org/ads.txt
```

### 3c. Local verification (do this before every campaign change)

1. `npm run dev`, then either add a tag in `/admin/ads` → Networks (live config)
   or set `NEXT_PUBLIC_AD_SLOTS` in `.env` (fallback, no DB).
2. Open `/en` in a **fresh** profile → the reserved box shows the house ad, and
   there is still no network request (consent unanswered).
3. Accept the cookie banner → reload → the tag host appears in the Network tab
   and the reserved box fills.
4. Reject the banner in another profile → **zero** requests to the tag host.
5. `curl.exe -sI http://localhost:3000/en | Select-String -Pattern 'content-security-policy'`
   → the tag origin is present in `script-src`. A database-configured tag is
   rejected by `/admin/ads` unless its origin is already covered by the
   deployment CSP (`NEXT_PUBLIC_AD_SLOTS` or `CSP_AD_EXTRA_HOSTS`); adding a
   new origin therefore requires a rebuild/redeploy before saving the tag.
6. Block the tag host at the OS/DNS level → the page still renders, the slot
   collapses, and no console error escapes the component.

### 3d. Direct-sold slot rows

Migration `20261205000000_ad_network_config.sql` inserts the placement keys that
had no `ad_slots` row — `news-index-rail`, `photo-story-index-rail`,
`notices-index-rail`, `notices-rail`, `culture-rail`, `buy-sell-index-rail`,
`contributor-rail` — so every placement the site renders can now also be sold
directly as a campaign. A new placement later means: key in `AD_PLACEMENTS`,
`slotKey` at the call site, and an `ad_slots` row.
---

## Stage 4 — Consent, privacy and policy (do not skip)

### 4a. What the code already guarantees

- Nothing from a network loads before the reader accepts the cookie banner
  (`lib/consent.ts` is the single flag; `consentRequired` defaults to true).
- Declining removes the tag entirely — there is no "legitimate interest" path in
  the code.
- The label ("Advertisement"/"Publicité") is always rendered above a boxed unit.
- No third-party script reaches `(app)`/`(focused)` shells.

### 4b. What must be written by a human

1. **Privacy policy** (`/about/privacy`) — **shipped, not a to-do.** The
   advertising disclosure (`components/about/advertising-disclosure.tsx`) always
   renders on that page, even when no `policy_versions` row is published (the
   page otherwise says "coming soon", which is exactly the state a platform must
   not be in with a tag live). It is dictionary-backed (en + fr), states that
   tags load only after consent, and **generates the partner list from the live
   config** (`enabledAdProviders`) with a link to each partner's own policy —
   so it can never name a partner the site does not use, or keep naming one
   after its last tag was removed. When none is enabled it says so.
   What still needs a human: the long-form policy text in `policy_versions`
   (retention, lawful basis, DPO/contact), if you want more than the disclosure.
2. **Cookie banner copy** — already updated in both dictionaries
   (`about.cookie.body`): it discloses that advertising partners may set cookies
   and that the reader's choice and the site's advertising settings decide
   whether third-party tags load. Keep it in sync if a future network needs a
   different wording.
3. **Terms / advertise page**: state that paid placement never buys editorial
   coverage (already in `features.md` and `/advertise`), and that the site is not
   responsible for advertiser offers.
4. **Takedown/reporting routes stay ad-free.** Advertising next to a correction
   or a takedown request looks like pressure on the record. None of those pages
   has a network placement — keep it that way.

### 4c. Policy landmines to design around

- Do not place ads where they can be mistaken for navigation or for an editorial
  card (no "download" buttons styled like site UI).
- No ads on empty states, 404s, or "not authorized" screens.
- One page-level format per session; stacking popunder + vignette + push is the
  fastest way to a network warning and a reader complaint.
- Do not obfuscate, auto-refresh, or reload ad frames to inflate impressions.
  `/api/ads/event` already deduplicates, and networks detect it server-side.
- No ads inside emails, digests, or push notifications without a separate
  decision — those surfaces are editorial.

---

## Stage 5 — Measurement and revenue

### 5a. Two datasets, on purpose

| Source | What it measures | Where |
|---|---|---|
| First-party (`ad_events`, counters) | Direct campaigns: impressions, clicks, CTR, per placement | `/admin/ads`, `app/api/ads/event/route.ts` |
| Network dashboard | Remnant revenue, eCPM, fill, GEO/device breakdown | Monetag / AdSense UI |

They will never match: the network counts its own served impressions, the beacon
counts first-party creatives only. Do not try to reconcile them line by line —
use first-party for sold inventory, network for remnant revenue.

### 5b. Metrics to watch weekly

- **Remnant RPM** = network revenue ÷ (page views ÷ 1000), per placement.
- **Direct sell-through** = sold slot-days ÷ available slot-days (from
  `ad_campaigns` date windows).
- **Fill rate** = placements that rendered a network tag ÷ placements requested.
- **CTR** per placement (a rail with < 0.05% CTR is usually below the fold and
  not worth the bytes).
- **Revenue per 1,000 sessions by format** — decide popunder vs banner with the
  number, not by assumption.

### 5c. Attribution hygiene

- One zone per placement key so the network dashboard maps 1:1 to this repo's
  keys.
- Keep the zone `network` label in `/admin/ads` identical to the
  dashboard name; it lands in `data-ad-network` and in the DOM for debugging.
- When you later add reporting APIs, store the imported revenue in its own table
  and never merge it into `ad_campaigns` counters — those belong to direct sales.
---

## Stage 6 — Performance and SEO guardrails

This audience is on metered mobile data, which is why `scripts/verify-anon-bundle.mjs`
and `.lighthouserc.cjs` exist. Ads are the single biggest threat to both gates.

### 6a. The budget you must not break

| Metric | Warn | Error | Where |
|---|---|---|---|
| LCP | 2.5 s | 5 s | `.lighthouserc.cjs` |
| CLS | — | 0.1 | `.lighthouserc.cjs` |
| TBT | 300 ms | 600 ms | `.lighthouserc.cjs` |
| Total bytes | 1.5 MB | 3 MB | `.lighthouserc.cjs` |
| Homepage JS | ≤ 120 KB gzipped | — | `docs/perf-budget.md` |

Run `npm run perf:lighthouse` after the first tag goes live, then weekly (the CI
job already exists).

### 6b. Layout shift — solved by the house card, not by a trade-off

The reserved box is part of the first paint (default `reserve_space = true`) and
is filled with the site's own **house ad** until the network tag paints. That
gives all three properties at once:

- **zero CLS** — the space never appears after hydration;
- **never an empty rectangle** — a reader who declines cookies still sees the
  "Advertise with us" card, which is a real CTA rather than a placeholder;
- **no wasted impression** — an unfilled slot still earns inquiries.

Turning `reserve_space` off restores the old behaviour (nothing renders until
consent, one layout insertion at hydration). Turning `house_ads_enabled` off
makes unfilled placements disappear entirely. Both are toggles in
`/admin/ads` → Networks, not env edits.

### 6c. Loading discipline already in place

- Tags inject only when the box is within 300 px of the viewport
  (`IntersectionObserver`), so below-the-fold rails cost nothing until scrolled.
- Page-level formats load on mount, once per session, never twice.
- Scripts are `async`, `referrerPolicy="no-referrer-when-downgrade"`, and never
  synchronous or document-parsing.
- Ad image hosts are a CSP allowlist derived from the config — never the blanket
  `https:` escape hatch.

### 6d. SEO

- Ads never render in `(app)`/`(focused)` shells (noindex areas) — no crawl
  surface, no wasted impressions.
- Do not add `noindex` to a page just because it carries ads; do the opposite —
  ad-heavy thin pages are a quality problem, so keep the content first.
- Keep the ad DOM out of the initial HTML for `(public)` pages: the ISR-cached
  HTML stays small and identical for every reader, which is also why the
  consent gate lives client-side.
- Advertiser destinations are `https`-only and opened with
  `rel="sponsored nofollow noopener"` (first-party links and smartlink units), so
  paid links cannot pass link equity.
---

## Stage 7 — Operations runbook

| Situation | Action |
|---|---|
| A tag breaks the page or starts redirecting readers | `NEXT_PUBLIC_ADS_ENABLED=0` + rebuild. Sold campaigns keep rendering. |
| One placement must stop | Disable or remove it in `/admin/ads` → Networks; no rebuild is needed. |
| A new network tag is CSP-blocked | Add its loader and required asset origins to `CSP_AD_EXTRA_HOSTS` + redeploy; the admin screen blocks tags whose loader origin is not yet allowed. |
| Malware/creative complaint from a reader | Trip the kill switch, screenshot + report to the network, re-enable when confirmed. |
| Network account suspended | Keep the config (tag 200s with no fill) or remove the keys; nothing else depends on it. |
| Revenue drops to zero | Check `/ads.txt` first (a stale record blocks demand), then the dashboard's site status. |
| Suspicious impressions | Inspect `/api/ads/event` dedup logs and `ad_events` for one campaign; network-side fraud is their dashboard's job. |
| Legal request about ad cookies | `lib/consent.ts` is the whole state: no consent = no tag, no exceptions. |

Database-backed network settings and placement changes take effect after cache
invalidation and do not require a rebuild. Changes to `CSP_AD_EXTRA_HOSTS`,
environment-based fallback config, or the ads kill switch are build/deploy
changes. Note changes in release notes and re-run `npm run check` — the
anon-bundle gate is the one most likely to notice a heavy tag.

---

## Stage 8 — Roadmap beyond the current state

Ordered by value per unit of work:

1. **Revenue import** — a cron route pulling network reporting APIs into an
   `ad_network_revenue` table, with the API key in the credential vault; then a
   real eCPM/RPM panel in `/admin/ads`.
2. **Floors and waterfall** — order two networks per slot by observed RPM
   instead of one tag per slot.
3. **Frequency capping** for page-level formats (`sessionStorage` counter is
   enough for one-per-session rules).
4. **`ads.txt` managed from the admin UI** (same lines to the DB, env as
   fallback).
5. **Creative QA for direct campaigns** already exists (`creative_status`);
   extend it to reject auto-playing audio and flash-style animation.
6. **Per-placement reporting** — join `ad_events` (direct) with imported network
   revenue to rank placements by actual yield.

---

## Go-live checklist

- [ ] Publisher account approved; site verified; payout profile complete.
- [ ] Migration applied; every placement configured in `/admin/ads` → Networks
      (no rebuild needed — the config is read from Postgres).
- [ ] `ad_network_settings` matches the policy decision (consent ON, reserve ON,
      house ads ON unless deliberately off).
- [ ] `ADS_TXT_LINES` set; `curl https://…/ads.txt` returns the records.
- [ ] CSP response header contains the tag origin in `script-src`.
- [ ] Fresh profile, no consent → zero requests to the tag host.
- [ ] Accept → tag loads once; reject → nothing loads.
- [ ] Privacy policy + cookie banner copy updated in **en and fr**.
- [ ] Ads absent from `/admin`, `/account`, `/auth`, `/submit`, 404.
- [ ] `npm run check` green; `npm run perf:lighthouse` within budget.
- [ ] Kill-switch drill: `NEXT_PUBLIC_ADS_ENABLED=0` + rebuild → network units
      gone, sold campaigns untouched.
- [ ] Weekly review scheduled (RPM, fill, CTR, complaints).
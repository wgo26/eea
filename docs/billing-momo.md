# Paid promotion with Mobile Money — operator runbook

Cameroon-first paid tiers (Phase 5): pro directory subscriptions and listing
boosts, billed in XAF over MTN MoMo / Orange Money. Prices live in
`lib/billing/plans.ts` — changing a price is a reviewed code change, never a
row edit.

## Plans

| Plan | What it buys | Price | Window |
|---|---|---|---|
| `pro_weekly` | Pro directory featuring | 1,000 XAF | 7 days |
| `pro_monthly` | Pro directory featuring | 3,000 XAF | 30 days |
| `boost_7d` | Listing ranks first + Boosted badge | 500 XAF | 7 days |
| `boost_30d` | Listing ranks first + Boosted badge | 1,500 XAF | 30 days |

Boosts rank first under the default newest sort only — price sorts stay pure
(the sort control must never lie for money). Boosts never touch
`content_items.is_featured` (the editorial homepage rotation); paid directory
featuring is namespaced by `businesses.featured_source = 'paid'` so expiry
only clears what money set.

## Money flow

1. Owner starts an intent (plan + MoMo number) → `pending` row with an
   `EEA-…` reference.
2. Webhook (`POST /api/billing/campay`) settles it: secret-checked
   (`CAMPAY_WEBHOOK_SECRET`, fail-closed 503 when unset), amount re-checked
   against the plan price, only `pending` rows move. Replay-safe.
3. No webhook yet? Confirm manually in `/admin/listings/claims` → Pending
   MoMo payments (same desks as listings). Same activation, same audit.

## Campay wiring checklist

- Campay Collect account with a collection shortcode/number.
- Set `CAMPAY_WEBHOOK_SECRET` in env; register the callback URL
  (`https://<host>/api/billing/campay`) with that secret in the dashboard.
- Test with a 100 XAF sandbox intent before announcing prices.
- Expiry needs nothing: `runDueContentSweep` flips lapsed rows and clears
  paid featuring; the owner-visible state reads past-due rows as expired even
  before the sweep runs.

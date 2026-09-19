Admin — no real CRUD on most pages:
- app/[locale]/(app)/admin/listings/page.tsx:51: getListingsAdmin + expire/relist/sold/remove only — no create, no full edit (price/contacts dialog only), no hard delete.
- admin/moderation/page.tsx: approve/reject/delete only, no SearchBar, no sorting, queue has no breadcrumbs ([id]/page.tsx:137 does).
- admin/trust-safety/page.tsx:88,139: resolve/delete only — no bulk, no search, no detail drawer, EmptyState with no CTA.
- admin/polls/page.tsx:35-36, admin/fundraisers/page.tsx, admin/ads/page.tsx:29-34: full create/update/delete but unpaged (getPollsAdmin() unpaged, fundraisers limit 100, ads 4x unpaged), no search/sort/bulk; polls delete uses plain Dialog:270-305 not ConfirmDialog.
- admin/taxonomy/page.tsx:81-97: custom GET search, not shared SearchBar; all rows client-filtered, no pagination.
- admin/site-content/site-content-forms.tsx:56, admin/policies/about-section-forms.tsx:49: window.confirm vs ConfirmDialog everywhere else.
- admin/notifications/page.tsx:87,107: retry-all unconfirmed, no pagination/filters, truncated event/title/error with no detail drawer.
- admin/audit-log/page.tsx:85-101: filters but no text search, notes truncated max-w-[200px], no detail drawer.
- Global: components/admin/data-table.tsx:11-16 supports sortable but 0 usages; PageHeader supports breadcrumb but list pages omit it; only admin/content/page.tsx:146-149 has EmptyState CTA.
Public — discovery/actions incomplete:
- app/[locale]/(public)/search/page.tsx:27: q+type only — no sort, no date/location/category, chips px-3 py-1.5 text-xs <44px, no save.
- buy-sell/page.tsx:205-228: sort as tiny text-xs links; location free-text Input:420-426, no dropdown; grid has no SaveButton (vs listing-card.tsx:78); detail buy-sell/[id]/page.tsx:122 gallery rest.slice(0,4) no lightbox/counter.
- Detail inconsistency: news/[slug]/page.tsx has ArticleActionRow + prev/next + TOC-extracted-but-never-rendered (headings=extractHeadings:117); photo-stories/[slug]/page.tsx:177 prev/next gated on story.body; culture/[slug] no prev/next; culture/events/[id]/page.tsx:53-59 back-link only, no save/report/related/reminder; notices/[id]/page.tsx:367-370 contact placeholder only.
- contributors/page.tsx:43 limit 60, no search/sort/pagination; locations/[place]/page.tsx:92,169,281 hardcoded EN strings; both use next/image not SmartImage; FollowButton:15-19 contributor-only, no follow-location/category.
- advertise/page.tsx:55-111: cards + form only — no pricing table, slot previews, FAQ. digest/page.tsx:35-43: form + archive link only, no sample issue. submit/page.tsx:58-81: 5 cards only, no status link/guidelines preview.
Account/submit/auth:
- account/dashboard/page.tsx:485-562: flat ActivityRow list — no status timeline/stepper, no edit-pending (only WithdrawSubmissionButton for pending|in_review in account/submissions/page.tsx:78-99).
- components/submit/submit-form.tsx:295-314: native checkValidity only, no autosave/localStorage — nav-away loses draft; uploads hidden in collapsed accordion :592-615; submit/confirmation/page.tsx:31-36 success + 2 buttons, no track-submission link.
- Auth: login-form.tsx:89-98, signup-form.tsx:107-120, update-password-form.tsx:53-62 all fixed type=password — no show/hide.
Cross-cutting:
- Breadcrumbs only on 5 details via system/content-breadcrumb.tsx:25; all indexes lack them.
- ThemeToggle:site-header.tsx:162 public-only — (app) shell 0 hits.
- Font-size/print patchy: showTextSize={false}:buy-sell/[id]:229, print only about/print-button + notices/print-button.tsx:16.
- No recently-viewed/reading-history (0 hits), no offline/SW/navigator.onLine, skeletons (system/page-skeletons.tsx) mixed with Loader2 spinners in forms.
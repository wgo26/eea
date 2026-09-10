# Admin manual (client-facing)

How editors, moderators, and administrators run Eagle Eye Africa day-to-day.
Every screen is under **/en/admin/…** (French: **/fr/admin/…**). You need a
role to see each section — the left menu only shows what your role can do.

> Screenshots: pending. Each section below lists what you do and what to
> watch out for. Add annotated screenshots here before handover.

## Signing in

- Sign in via the site; the first admin is assigned in the Supabase dashboard
  (`user_roles` table, role `admin`).
- If you can't see a section, you don't have the capability — ask an admin to
  add the role.

## Dashboard `/admin`

At-a-glance counts. Hover the cards: several link into the relevant section.
**This is a snapshot, not realtime** — refresh to update.

## Moderation `/admin/moderation`

Where public submissions land before they appear on the site.

- **Queue** lists pending submissions. Filter by type/status; paginated.
- Open a submission to see the full detail: contact, payload, photos, and the
  **Approve with content** drawer (creates the real published item — fill the
  bilingual titles/body, attach photos, choose publish now / schedule / draft,
  and set the listing/notice fields when applicable).
- **Reject** requires a reason (sent to the submitter's flow).
- **Request clarification** emails the submitter for more info.

## Trust & Safety `/admin/trust-safety`

Reports (content abuse), corrections, and data/contact requests. Resolve,
dismiss, or escalate per policy. Keep the reason notes complete — they are
audited.

## Content `/admin/content`

The main editorial section.

- **Create** via "New item" (type-specific fields: news, photo story, listing,
  notice, culture event).
- **Edit** opens the drawer with the `MediaUploader` — drag & drop, paste
  URLs, **reuse a past asset** from the media library, set alt text/captions.
  The first photo is the cover.
- **Archive** is the reversible soft delete; **Delete** is permanent and
  admin-only (use sparingly).
- **Homepage** tab manages the curated slots (assign, reorder up/down, toggle
  visibility, delete).

## Listings `/admin/listings`

Lifecycle view of buy/sell listings (from submissions or content). Expire,
relist, mark sold. **Note:** price/photos/seller are edited in the Content
section (the listing's content item) — a cross-link is planned.

## Taxonomy `/admin/taxonomy`

Categories + locations. Edit per-translation names, reassign content when you
rename (content follows), and delete/block unused values. Redirect rules for
renamed slugs live here.

## Polls `/admin/polls`

- Polls are single-locale; filter by locale.
- **Options lock once votes exist** — to change an option, close the poll first.
- Deleting a poll with votes requires the admin override checkbox.

## Fundraisers `/admin/fundraisers`

Goal, currency, organizer, URL, and the bilingual title/description. Deletion
is admin-only; treat as permanent.

## Legal & Policies `/admin/policies`

Versioned legal text (About, Terms, Privacy, …), plus **About/Advertise page
copy overrides** and the **Legal inbox** (takedown + data requests — respond
within the legally required window).

## Site content `/admin/site-content`

Staff-maintainable copy without a code deploy:

- **Advertise page**: heading/body per locale + the placements/audience/pricing
  cards.
- **Footer social links**: Facebook + YouTube (empty hides the icon).
- **Brand & logo**: site name/tagline per locale + the **logo image** (upload a
  PNG/SVG). The logo feeds the header, footer, **and the browser-tab icon**.
  Clear it to return to the built-in mark.

## Users & roles `/admin/users`

- Invite staff via email; assign roles (admin/editor/contributor/advertiser).
- Suspend/ban/restore accounts (restore requires a confirmation).
- Reauthentication is required for sensitive changes.

## Ads `/admin/ads`

Four views: **slots** (placements), **advertisers**, **inquiries** (pending
campaigns — approve/reject, edit, delete), and **campaigns** (active/ended/
paused). Publish = the campaign is approved WITH active dates on a slot; the
server blocks conflicting bookings.

## Storage `/admin/storage-backup`

- Per-provider usage + the **media assets** table: verify a file's checksum,
  delete an asset permanently (admin-only; the B2 backup copy is kept).
- **Manual backup** queues un-backed-up files; **Verify files** queues checksum
  checks. The nightly cron runs automatically.

## Audit log `/admin/audit-log`

Who did what, when — the compliance record. Filter by action/entity/date and
**Export CSV**. Audit entries are never deleted by the UI.

## Golden rules

1. **Archive, don't delete** when in doubt — delete is irreversible.
2. **Keep bilingual content complete** — an English-only item shows empty
   French translation on /fr/.
3. **The first photo is the cover** — put the best image first.
4. **Moderation is the heartbeat** — clear the queue daily; the nightly ops
   digest (see `docs/observability.md`) can remind you.
# EAGLE EYE AFRICA — SITE MAP

This maps every primary page implied by the Master Feature Set (Sections 1–18) and the Gap-Fill Sections (19–24) into a hierarchy, plus how pages link to each other.

---

## 1. TOP-LEVEL STRUCTURE

```
/ (Homepage)
├── /photo-stories
├── /news
├── /buy-sell
├── /notices
├── /culture
├── /submit
├── /search
├── /locations
├── /contributors
├── /advertise
├── /account
├── /admin
└── /about (legal & static)
```

Every top-level section follows the same **Index → Detail** pattern, and every Detail page follows the same **content + related + share + report** pattern. That repetition is intentional — it's what makes the "One Community Board" differentiator (Section 18, #4) feel coherent rather than like five separate mini-sites stitched together.

---

## 2. HOMEPAGE

```
/
├── Hero story (links to → Story/Photo Story detail)
├── Secondary stories (→ detail pages)
├── Latest Photo Stories rail (→ /photo-stories, → individual stories)
├── Latest Community News rail (→ /news, → individual articles)
├── Latest Notices rail (→ /notices, → individual notices)
├── Buy & Sell preview (→ /buy-sell, → individual listings)
├── Culture & Entertainment preview (→ /culture)
├── Ad slots (→ external advertiser links)
├── "Submit a Story" CTA (→ /submit)
├── Search bar (→ /search)
└── Footer
    ├── /about
    ├── /about/terms
    ├── /about/privacy
    ├── /about/guidelines
    ├── /about/copyright
    ├── /advertise
    └── /locations
```

The homepage is a **hub, not a destination** — every module exists to route the visitor into one of the six content verticals or into `/submit`.

---

## 3. PHOTO STORIES

```
/photo-stories                          (Index)
├── Filters: category, location, date
├── Search (shared with /search)
├── Sort: latest / featured
└── /photo-stories/[slug]                (Detail)
    ├── Lead photograph + gallery
    ├── Captions, photographer credit → /contributors/[id]
    ├── Location tag → /locations/[place]
    ├── Category tag → /photo-stories?category=X
    ├── Related stories → other /photo-stories/[slug]
    ├── Previous/Next navigation (within category or chronologically)
    ├── Share (native + WhatsApp)
    └── "Eye on the Street" micro-format (Diff. #8) uses this same template, shorter body
```

---

## 4. COMMUNITY NEWS

```
/news                                    (Index)
├── Filters: category, location
├── Featured / Breaking indicator
└── /news/[slug]                         (Detail)
    ├── Headline, featured image, body, byline → /contributors/[id]
    ├── Location tag → /locations/[place]
    ├── Related stories
    ├── Share + WhatsApp
    ├── "Report a correction" → /news/[slug]/correction (form, Section 13)
    └── Timeline format (Diff. #6) renders here as a special article type
        e.g. /news/[slug] with a chronological event log instead of prose
```

---

## 5. BUY & SELL

```
/buy-sell                                (Index)
├── Filters: category, price, location, date
├── Sort: newest / price asc / price desc
├── Category sub-pages → /buy-sell/[category]
└── /buy-sell/[listing-id]                (Detail)
    ├── Photos, title, price, description
    ├── Location tag → /locations/[place]
    ├── Seller info → /contributors/[id] (if seller profile exists, Section 15)
    ├── Reveal-contact button (gated)
    ├── Share, Report listing, Mark as sold
    └── "Similar listings" → other /buy-sell/[listing-id]

/buy-sell/post                            (Posting flow — same form family as /submit?type=buy-sell)
```

---

## 6. NOTICES

```
/notices                                 (Index)
├── Filters: notice type, location, verification status
└── /notices/[id]                        (Detail)
    ├── Title, description, location → /locations/[place]
    ├── Date / expiry date
    ├── Organization/person posting → /contributors/[id] (if org profile, Section 15)
    ├── Verification badge (✓ VERIFIED / COMMUNITY SUBMISSION / OFFICIAL SOURCE / DEVELOPING — Diff. #5)
    ├── Contact information
    └── Share + WhatsApp
```

---

## 7. CULTURE & ENTERTAINMENT

```
/culture                                 (Index)
├── Sub-sections: /culture/music, /culture/art, /culture/fashion,
│                 /culture/events, /culture/food, /culture/film
└── /culture/[slug]                      (Detail — article, gallery, or event)
    ├── Body content, embeds (Instagram, video)
    ├── Event info block (if event): date, time, venue → /locations/[place]
    ├── Related content
    └── Share + WhatsApp

/culture/events                          (Event-specific index, calendar view — Section 16)
└── /culture/events/[id]                 (Event detail, same shape as above)
```

---

## 8. SUBMIT A STORY

```
/submit                                  (Type selector)
├── /submit/photo-story    → feeds /photo-stories after moderation
├── /submit/news           → feeds /news after moderation
├── /submit/culture        → feeds /culture after moderation
├── /submit/notice         → feeds /notices after moderation
└── /submit/buy-sell       → feeds /buy-sell after moderation

/submit/confirmation                     (Post-submit status page)
```

All five forms are dynamic variants of one form component — they share the underlying submission → moderation queue pipeline (Section 8) but render different fields.

No submission page requires an account; a lightweight phone/email verification step sits inside the flow, not in front of it.

---

## 9. SEARCH

```
/search
├── Query bar (also embedded in header on every page)
├── Filters: content type, location, date, category
└── Results grouped by type:
    ├── Photo Stories → /photo-stories/[slug]
    ├── News → /news/[slug]
    ├── Notices → /notices/[id]
    ├── Buy & Sell → /buy-sell/[listing-id]
    └── Culture → /culture/[slug]
```

Search is the one page every other index page's "search" control actually points to (with a type filter pre-applied), rather than each section running its own separate search.

---

## 10. LOCATIONS (Place-First Journalism, Diff. #3 & #10)

```
/locations                               (Index of all places)
└── /locations/[place]                   (e.g. /locations/bamenda, /locations/mankon)
    ├── News from this location → /news/[slug]
    ├── Photo Stories from this location → /photo-stories/[slug]
    ├── Notices from this location → /notices/[id]
    ├── Buy & Sell from this location → /buy-sell/[listing-id]
    ├── Events from this location → /culture/events/[id]
    ├── Community Memory timeline (Diff. #10): year-by-year view
    ├── "Then & Now" pairs, if available (Diff. #11)
    ├── Weather widget (Gap-fill Section 24)
    └── Eventually: embedded map pin (Diff. #12, /map)
```

This is the page that makes the platform feel like "a living digital memory of places" rather than a news site with a location filter bolted on — every content type routes back here via its location tag.

---

## 11. CONTRIBUTORS (Diff. #7)

```
/contributors                            (Directory, optional/future)
└── /contributors/[id]                   (Public profile)
    ├── Name, location, categories
    ├── Published portfolio → /photo-stories/[slug], /news/[slug], etc.
    ├── Stats: X published stories, Y photographs
    └── (Logged-in contributor sees private dashboard instead, see /account)
```

---

## 12. ACCOUNT / AUTH (Gap-fill Section 22)

```
/account/login
/account/signup
/account/reset-password
/account/dashboard                        (role-dependent view)
    ├── Contributor view:
    │   ├── Submission history
    │   ├── Submission status
    │   ├── Edit pending submission
    │   └── → /contributors/[id] (public profile)
    ├── Advertiser view:
    │   ├── Campaign info → /advertise
    │   └── (Future) Impression/click reporting
    └── Saved/bookmarked content (Section 15):
        ├── Saved stories → /news/[slug], /photo-stories/[slug]
        ├── Bookmarked listings → /buy-sell/[listing-id]
        └── Followed categories/locations → /locations/[place]
```

---

## 13. ADVERTISE

```
/advertise
├── Placements, audience, pricing, formats, campaign duration
├── Contact/inquiry form → feeds Admin advertiser queue
└── (Future) /advertise/dashboard → self-service campaign management (Section 16)
```

---

## 14. ABOUT / LEGAL (Gap-fill Section 19)

```
/about
├── /about/terms
├── /about/privacy
├── /about/guidelines           (Community Guidelines / Code of Conduct)
├── /about/copyright             (Copyright & Takedown Policy)
└── /about/contact
```

Linked from the global footer on every page, plus specifically from the submission consent step (`/submit/*`) and from every "Report" action (correction, listing, content).

---

## 15. ADMIN / EDITORIAL (Section 8–9, internal — not public)

```
/admin
├── /admin/dashboard
│   ├── Pending submissions/listings/notices counters → /admin/moderation
│   ├── Published today, scheduled content
│   ├── Expiring listings
│   ├── Active ads
│   └── Storage/backup status (Section 14)
├── /admin/moderation
│   └── Tabs: All | Stories | News | Listings | Notices | Culture | Ads
│       each → Preview/Review/Edit → publish target page (e.g. /news/[slug])
├── /admin/content
│   ├── Draft/Pending/Approved/Scheduled/Published/Archived views
│   └── Homepage curation (choose hero, secondary, featured per section)
├── /admin/users                 (Role management: Admin/Editor/Contributor/Advertiser)
├── /admin/ads                   (Ad-slot manager: creative, placement, dates)
├── /admin/storage-backup        (Provider usage, thresholds, manual backup, restore)
└── /admin/audit-log             (Section 15)
```

---

## 16. HOW PAGES INTERCONNECT (cross-cutting links)

Rather than five silos, most detail pages carry the same four link types outward:

| From any detail page | Links to |
|---|---|
| **Location tag** | `/locations/[place]` — pulls every content type tied to that place |
| **Category tag** | back to the parent index, filtered |
| **Contributor/byline/org** | `/contributors/[id]` |
| **Share/WhatsApp** | external, but drives return traffic back into whichever detail page was shared |

This is what makes Differentiator #4 ("One Community Board") actually work as a site structure and not just a homepage layout: a reader following a **location** tag from a road-closure notice can land on `/locations/mankon` and see a photo story, a news update, and a for-sale listing from the same place, without ever going back through the homepage.

`/search` and `/locations/[place]` are the two "everything" pages — every other page is reachable from either.

---

## 17. LANGUAGE STRUCTURE (Gap-fill Section 20)

The sitemap above is shown language-agnostic. Here's how it's actually affected.

**Two full content languages:** English, French.
**One tone overlay, not a third full language:** Pidgin (Mboko) / Camfranglais — applied to specific formats only, not the whole site.

### Full-language pages (English/French — every URL exists in both)
```
/                              → /fr/
/photo-stories, /photo-stories/[slug]      → /fr/...
/news, /news/[slug]                        → /fr/...
/buy-sell, /buy-sell/[listing-id]          → /fr/...
/notices, /notices/[id]                    → /fr/...
/culture, /culture/[slug]                  → /fr/...
/submit/*                                  → /fr/...
/search                                    → /fr/...
/locations, /locations/[place]             → /fr/...
/about/* (legal pages)                     → /fr/... (legal text especially should not be English-only)
```
Recommended pattern: `/fr/` prefix (or subdomain), with a language switcher in the header on every page, and `hreflang` tags for SEO. Category and location taxonomies (Section 20's open question) need a translated label per locale, but the same underlying `slug`/`id`, so `/locations/bamenda` and `/fr/locations/bamenda` point at the same place record rather than forking content.

### Pidgin/Camfranglais — tone, not a routed language
No `/pcm/` or third locale prefix at this stage. Instead, it shows up **inside** existing pages as an alternate field/voice, not a parallel page tree:
```
/photo-stories/[slug]
    └── "Eye on the Street" caption field — may be written in Pidgin/Camfranglais register directly, no separate URL

/daily-brief (future, Section 24)
    └── Digest copy in Pidgin/Camfranglais as the default voice, since this is WhatsApp-native

Any detail page's Share/WhatsApp button
    └── Share text can pull a Pidgin/Camfranglais variant distinct from the formal article body,
        still pointing at the same canonical /news/[slug] or /photo-stories/[slug] URL
```
If Pidgin/Camfranglais later graduates to full articles (not just captions/share text), it would need its own locale prefix and CMS field the same way French does — worth deciding before that happens, since retrofitting a third full locale onto existing content is more work than adding it now as an empty-but-planned field.

### Search
`/search` needs to query across whichever locales/registers actually have content — otherwise an English-only search misses French articles about the same event, and vice versa.

---

## 18. FUTURE / SECTION-16-DEPENDENT PAGES (not built first, but structurally anticipated)

```
/map                          (Diff. #12 — interactive map, pins → all detail pages)
/daily-brief                  (Diff. #9 — WhatsApp/email digest, links out to the day's content)
/community                    (if comments/reactions/polls/groups are added — Section 16)
```

These aren't part of the initial build (Section 17, "Won't Have For Now" explicitly excludes heavy social features and the map is listed as "Eventually" under Diff. #12), but the location-tag and contributor-tag structure above is designed so they can be added without restructuring existing pages.

Now let me write the comprehensive UX/UI audit report based on my findings.

UX/UI Audit Report: Eagle Eye Africa Application
Date: September 22, 2026
Scope: Full application review focusing on location filtering, admin content management, and general usability gaps
Methodology: Codebase analysis of ~50+ pages/components across public views, admin interfaces, and shared components

Executive Summary
The application demonstrates strong architectural foundations with consistent i18n patterns, proper locale-first routing, and a well-structured admin system. However, three critical areas require attention:

Location Filter Inconsistencies — Multiple filter implementations with divergent UX patterns across 8+ content verticals
Admin Content Management — Status transition workflows exist but lack visual affordances, batch operation clarity, and editorial safeguards
General Usability Gaps — Search/filter persistence, empty states, mobile responsiveness, and cross-vertical consistency issues
1. Location Filter Inconsistencies
1.1 Divergent Filter Implementations Across Verticals
Vertical	Filter Type	UI Pattern	Cookie/Sync	Persistence
Homepage (HomeNearYouClient)	Implicit (cookie-based)	Single place selector in header	✅ eea-place cookie	Auto-applied
Locations index (/locations)	None (browse hubs)	Card grid + map	❌	N/A
Location hub (/locations/[place])	None (pre-filtered)	Content grouped by type	❌	URL-based
News (/news)	Sidebar chip list	Horizontal chips (20 max)	❌	URL query param
Culture (/culture)	Sidebar chip list	Horizontal chips (all)	❌	URL query param
Culture Events (/culture/events)	Inline chip nav	Pill buttons with counts	❌	URL query param
Notices (/notices)	Sidebar chip list	Rounded pills with counts	❌	URL query param
Photo Stories (/photo-stories)	Sidebar chip list	Rounded pills with counts	❌	URL query param
Buy & Sell (/buy-sell)	Sidebar text input	Free-text input (no autocomplete)	❌	URL query param
Map (/map)	Sidebar checkboxes	Checkbox list (20 max)	❌	URL query param (planned)
Search (/search)	None	Type tabs only	❌	N/A
1.2 Specific Inconsistencies Identified
A. Header Place Selector vs. Page-Level Filters
PlaceSelector (header chrome): Uses Dialog + Command palette with search, persists to eea-place cookie, triggers router.refresh() on change
Page filters (News, Culture, Notices, Photo Stories): Use horizontal chip navigation (Link elements), persist via URL query params (?location=slug), no cookie sync
Buy & Sell: Uses free-text <Input name="location"> with no autocomplete, no validation against known places
Map: Uses checkbox list with defaultChecked (uncontrolled), no URL sync implemented
Impact: Users selecting "Yaoundé" in the header see "Near You" content on homepage, but navigating to /news shows all locations unless they manually re-select. The mental model breaks: header place ≠ page filter.

B. Filter UI Patterns Vary Wildly
Chips vs. Pills vs. Checkboxes vs. Text Input — No shared component
Count badges present on News, Culture Events, Notices, Photo Stories — absent on Buy & Sell, Map
Max items: News limits to 20 (slice(0, 20)), Culture shows all, Map limits to 20, Photo Stories shows all
"All" option: News/Culture/Notices/Photo Stories have explicit "All" chip; Buy & Sell uses "clear" link; Map has no "All" checkbox
Active state styling: Inconsistent — some use bg-primary text-primary-foreground, others border-primary bg-primary/10
C. Location Data Source Fragmentation
News: getNewsLocations() → returns facets with counts
Culture: getUpcomingEvents() → derives locations from events
Notices: getNoticesLocations() → returns facets with counts
Photo Stories: getPhotoStoryLocations() → returns facets with counts
Buy & Sell: No location facet API — free text only
Map: getAllLocations() → returns all locations with contentCount
Header/Places API: /api/places → returns flat list for selector
Each vertical fetches its own location subset, leading to different location lists, different counts, different sort orders.

D. No Cross-Vertical Filter Persistence
User filters News by "Douala" → navigates to Culture → filter lost
User selects place in header → navigates to Notices → filter not applied
No "global location context" despite the eea-place cookie existing
1.3 Suggested Improvements
Priority	Issue	Recommendation
P0	Header place ≠ page filters	Create useLocationContext() hook that reads eea-place cookie and provides locationSlug to all verticals. Page filters should default to header place when no ?location= param exists.
P0	Fragmented location APIs	Consolidate to single getLocationFacets(type?, locale?) server function returning { slug, name, parentName, count }[] with consistent sorting (by count desc, then name).
P1	Inconsistent filter UI	Build shared <LocationFilter /> component with variants: chips (horizontal), pills (vertical with counts), select (mobile), checkboxes (map). All variants consume same facet data.
P1	Buy & Sell free-text location	Replace text input with <LocationFilter variant="select" /> backed by facet API. Add "Use my place" quick-action reading eea-place cookie.
P1	Map checkboxes uncontrolled	Convert to controlled components synced to URL (?location=slug1,slug2) with "All" toggle.
P2	Cross-vertical persistence	Add location to localePath() utility so links preserve filter: localePath(locale, '/culture', { location }).
P2	Count badge consistency	All location filters show content counts. Use shared LocationPill component.
2. Admin Content Management
2.1 Current Status Transition Capabilities (Code Analysis)
The admin does support DRAFT → PUBLISHED transitions and other status changes. The implementation exists in:

ContentActions (content-actions.tsx): Per-row action menu with status transitions
ContentBulkActions (content-bulk-actions.tsx): Bulk publish/unpublish/archive
ContentCreateDialog (content-dialogs.tsx): Create with publish: 'now' | 'schedule' | 'draft'
Status Transition Matrix (from content-actions.tsx:42-52):

Current Status	Available Transitions
draft	→ published (Publish), → scheduled (Schedule)
scheduled	→ published (Publish now), → draft (Unschedule)
published	→ draft (Unpublish)
archived	→ (unarchive via bulk actions)
2.2 Critical Usability Gaps in Status Management
A. No Visual Status Workflow Indicator
Status shown as StatusBadge (colored pill) but no indication of valid next states
Users must open action menu to discover "Publish" is available for drafts
No progressive disclosure: all transitions equally visible regardless of editorial workflow
B. Bulk Actions Lack Contextual Intelligence
"Publish" bulk action appears even when selected items include scheduled/draft mix — no validation
No preview of which items will actually transition vs. which are already in target state
Undo toast appears but no visual diff of what changed
C. Schedule Dialog UX Issues
Uses datetime-local input (browser-dependent, no timezone clarity)
No "quick pick" presets (Tomorrow 9am, Next Monday, etc.)
No preview of scheduled publish time in user's locale
D. Draft ↔ Published Toggle Missing from List View
Current: Must open action menu (2 clicks) → select Publish/Unpublish
Expected: Inline toggle or single-click status change for high-frequency actions
Comparison: Ghost, WordPress, Contentful all offer inline status toggle
E. No Editorial Workflow Guards
No "ready to publish" checklist (featured image, SEO, excerpt, category, location)
No approval workflow — any editor can publish directly
No revision history visible in list view (exists in getContentHistoryData but not surfaced)
No "preview before publish" — must save as draft, then open preview in new tab
F. ContentCreateDialog Overwhelms with Fields
40+ fields visible by default (including advanced: slug, SEO, tags, author, media URLs, type-specific fields)
No progressive disclosure: all sections expanded
Type-specific fields (listing, notice, culture) shown conditionally but no visual grouping
No "minimum viable publish" mode — users must scroll past advanced fields to reach publish buttons
G. Bilingual Content UX Gaps
EN/FR fields side-by-side but no sync indicator when one locale filled and other empty
Translate buttons exist but no auto-translate (placeholder only)
No warning when publishing with missing FR content (only hint text)
2.3 Suggested Improvements
Priority	Issue	Recommendation
P0	No inline status toggle	Add StatusToggle column to ContentTable with dropdown: Draft → Publish, Published → Unpublish, Scheduled → Publish now/Unschedule. Use optimistic UI with undo toast.
P0	No publish readiness checklist	Add PublishReadiness component to edit dialog: validates required fields (image, excerpt, category, location, FR title/excerpt) and shows ✅/⚠️ per item. Block publish until critical items pass.
P1	Bulk actions lack intelligence	Pre-filter bulk action targets: only show "Publish" for draft items, "Unpublish" for published. Show count badge: "Publish (3 of 5 selected)".
P1	Schedule UX	Replace datetime-local with <DateTimePicker /> with presets, timezone display, and locale-formatted preview.
P1	Create dialog complexity	Implement progressive disclosure:
1. Essential (title, excerpt, body, type, category, location, image) — always visible
2. Editorial (byline, tags, author, verification, SEO) — collapsible
3. Advanced (slug, scheduling, expiry, media URLs, type-specific) — collapsible
4. Type-specific — auto-expand when type selected
P2	Bilingual gaps	Add "Copy EN → FR" button with machine translation placeholder. Show "FR missing" warning badge on publish if FR fields empty.
P2	Revision history	Add "History" button to ContentActions opening drawer with getContentHistoryData (timeline of status changes, edits, authors).
P2	Preview before publish	Add "Preview" button next to Publish that opens /preview/{id}?secret=... in new tab (signed preview URL).
3. General Usability Gaps
3.1 Search & Filter Persistence Issues
Gap	Location	Impact
No "recent searches" memory	All search pages (/search, /news, /culture, etc.)	Users re-type common queries
Filters reset on navigation	All verticals	Select location in News → go to Culture → filter lost
No "save filter" / "saved views"	Admin content list, public verticals	Power users rebuild same filters daily
URL params not shared across verticals	Cross-vertical navigation	?location=douala&category=politics works in News but ignored in Culture
3.2 Empty State Inconsistencies
Page	Empty State Pattern	Issues
News	Card with icon + message + "Submit" CTA	Good pattern
Culture	Same as News	Good
Notices	Same as News	Good
Photo Stories	Same as News	Good
Buy & Sell	Same as News	Good
Search	Dashed border box, no CTA	Missing "Submit" CTA
Map	Skeleton only, no empty message	No empty state for 0 pins
Location hub (/locations/[place])	EmptyState component	Good but no "browse other places" action on hub pages with content
Admin content	EmptyState with create dialog trigger	Good
3.3 Mobile Responsiveness Gaps
Component	Desktop	Mobile	Issue
Admin sidebar	Persistent	Hidden behind hamburger	No mobile filter access — filters in FilterPills only render on desktop
Location chips (News/Culture)	Horizontal scroll	Horizontal scroll	No "show more" / dropdown on mobile — chips overflow
Map page	Sidebar + map	Map only (sidebar hidden)	Filters completely inaccessible on mobile
ContentTable (admin)	Full columns	Horizontal scroll	Actions column clipped — no mobile action menu
HomeNearYouClient	3-col grid	1-col grid	Works but place selector not accessible (header chrome only)
3.4 Cross-Vertical Consistency Issues
A. Category/Type Filter Patterns
News: Sticky horizontal chips under header (good)
Culture: Inline horizontal chips (non-sticky)
Culture Events: Inline horizontal chips
Notices: Inline horizontal chips + status chips (two rows)
Photo Stories: Inline horizontal chips
Buy & Sell: Inline horizontal chips
Map: Checkbox list in sidebar
No shared <FacetFilter /> component — each reimplements pill rendering, active state, URL building.

B. Sort Options Inconsistency
News: Newest / Most Read (chips in header)
Culture: No sort (newest only)
Photo Stories: No sort (newest only)
Notices: No sort (newest only, but has status filter)
Buy & Sell: Newest / Price Asc / Price Desc (dropdown-style in header)
Map: No sort
C. Pagination Patterns
News/Culture/Photo Stories/Notices/Buy & Sell: Same Pagination component — consistent ✅
Admin content: Uses Pager component (different UI)
Search: No pagination (infinite groups)
Map: No pagination (map-based)
D. Sidebar Search Forms
Every vertical has nearly identical sidebar search form with:

Hidden inputs for active filters (category, location, status, sort)
Search input + submit button
Clear filters link
Duplicated 7+ times — should be shared <VerticalSearchSidebar /> component.

3.5 Accessibility Gaps
Issue	Locations	WCAG Impact
Map page filters	/map	Checkboxes lack <fieldset>/<legend>, no ARIA live region for pin updates
Location chips	All verticals	aria-current="page" used correctly but no aria-label on chip container
PlaceSelector dialog	Header	Command component — need to verify focus trap, escape handling
Admin action menus	ContentActions	Custom ActionMenu — verify keyboard navigation (Tab, Enter, Escape)
ContentCreateDialog	Admin	40+ fields — no fieldset grouping, tab order may be confusing
3.6 Performance & Perceived Performance
Issue	Evidence
Homepage streams 10+ Suspense boundaries	page.tsx lines 89-141 — good streaming but no priority hints (hero vs. near-you vs. ads)
Map page loads 400 stories	map/page.tsx:77 — getMappedContent(locale, 400) — heavy initial payload
Admin content table	content-bulk-actions.tsx — loads all columns including images for every row
No virtualization	DataTable renders all rows — problematic for 100+ item admin lists
3.7 Suggested Improvements (General)
Priority	Area	Recommendation
P0	Mobile filters	Add mobile filter drawer (sheet) for all verticals + map. Trigger via "Filters" button in header.
P0	Shared filter component	Extract `<FacetFilter chips={[]} active={} onChange={} variant="chips
P0	Cross-vertical filter sync	Implement useLocationContext() + useCategoryContext() hooks that persist to URL and sync across verticals via shared query key.
P1	Empty states	Audit all empty states: add consistent CTA (Submit, Browse All, Adjust Filters). Map page needs empty state for "no pins match filters".
P1	Sidebar search component	Extract <VerticalSearchSidebar> with props: filters, dict, locale, clearHref. Eliminate 7+ duplicates.
P1	Admin table virtualization	Add @tanstack/react-virtual to DataTable for 50+ row lists.
P2	Saved views	Add "Save filter" → "My Views" dropdown in admin + public verticals (localStorage + server sync for logged-in).
P2	Recent searches	Add useRecentSearches hook (localStorage, max 5) with autocomplete in search inputs.
P2	Accessibility audit	Run axe-core on: Map filters, PlaceSelector, ActionMenu, ContentCreateDialog. Fix focus management, ARIA labels.
P2	Map performance	Implement viewport-based pin loading (only fetch pins in current bounds). Add clustering at low zoom.
4. Implementation Priority Matrix
Effort \ Impact	High Impact	Medium Impact	Low Impact
Low Effort	• Shared FacetFilter component
• Mobile filter drawer trigger
• Empty state CTA consistency
• Admin inline status toggle	• Recent searches localStorage
• Map empty state
• Buy & Sell location select	• StatBlock consistency
• Pagination component unification
Medium Effort	• useLocationContext() hook + header sync
• Consolidated location facet API
• Publish readiness checklist
• Progressive disclosure in create dialog	• Shared VerticalSearchSidebar
• Schedule datetime picker
• Bulk action intelligence	• Revision history drawer
• Preview before publish
High Effort	• Cross-vertical filter persistence (architectural)
• Admin table virtualization
• Full accessibility remediation	• Saved views (localStorage + server)
• Machine translation integration	• Viewport-based map loading
• Global design system audit
5. Recommended Next Steps
Week 1-2 (Quick Wins):
Extract FacetFilter component, apply to News/Culture/Notices/Photo Stories/Buy & Sell
Add mobile filter drawer trigger to all vertical headers
Standardize empty states with "Submit" CTA
Add inline status toggle to ContentTable
Week 3-4 (Core Fixes):
Build useLocationContext() hook + consolidated location facet API
Implement publish readiness checklist in create/edit dialogs
Progressive disclosure for ContentCreateDialog
Shared VerticalSearchSidebar component
Week 5-6 (Polish & Scale):
Bulk action intelligence + schedule picker upgrade
Admin table virtualization
Accessibility audit + fixes
Saved views foundation
Appendix: Key Files Referenced
Area	Files
Location Filter (Header)	components/locations/place-selector.tsx, components/locations/place-prompt.tsx, components/home/home-near-you-client.tsx
Location Filter (Verticals)	app/[locale]/(public)/news/page.tsx, app/[locale]/(public)/culture/page.tsx, app/[locale]/(public)/culture/events/page.tsx, app/[locale]/(public)/notices/page.tsx, app/[locale]/(public)/photo-stories/page.tsx, app/[locale]/(public)/buy-sell/page.tsx, app/[locale]/(public)/map/page.tsx
Admin Content	app/[locale]/(app)/admin/content/page.tsx, app/[locale]/(app)/admin/content/content-actions.tsx, app/[locale]/(app)/admin/content/content-bulk-actions.tsx, app/[locale]/(app)/admin/content/content-dialogs.tsx
Shared Components	components/admin/filter-pills.tsx, components/admin/data-table.tsx, components/admin/bulk-actions.tsx, components/admin/status-badge.tsx
This audit is based on static code analysis. Runtime testing with real users would validate prioritization and uncover additional issues.
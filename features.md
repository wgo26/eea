EAGLE EYE AFRICA — MASTER FEATURE SET
Product positioning
Eagle Eye Africa is a community-first African media platform combining local journalism, visual storytelling, community information, classifieds, culture, and citizen participation in one place.
The core loop is:
Discover → Read → Participate → Submit → Verify → Publish → Share → Return
The important distinction is that Eagle Eye Africa shouldn't feel like just another news website. It should feel like a digital community record of what is happening around people.

1. ESSENTIALS
These features are considered non-negotiable.
A. Homepage / Discovery
Hero story / featured story
Secondary stories
Latest Photo Stories
Latest Community News
Latest Notices
Buy & Sell preview
Culture & Entertainment preview
Advertisement slots
"Submit a Story" CTA
"View all →" links for every major section
Responsive mobile layout
Search
Clear publication dates/timestamps
Story cards with:
image
headline
category
date
location where relevant
Related stories
Latest stories feed
Social sharing
WhatsApp sharing
It should function as a high-quality editorial front page that sends users into the actual sections.

2. PHOTO STORIES
This is Eagle Eye Africa's strongest product.
Photo Stories Index
Masonry/grid layout
Large photography
Category filtering
Location filtering
Date filtering
Search
Latest/featured sorting
Categories could include:
Culture
Community
Infrastructure
Business
People
Events
Environment
Education
Public Life
Everyday Africa
Story Detail
Full-width lead photograph
Photo gallery
Captions
Photographer credit
Publication date
Location
Story description
Related stories
Share buttons
WhatsApp share
Previous/next story navigation
Contributor credit
Every published community submission should be able to display:
Photo: [Contributor Name]
or
Submitted by [Name]
This creates an incentive to contribute.

3. COMMUNITY NEWS
News Index
Chronological feed
Category filtering
Location filtering
Search
Featured stories
Breaking/recent indicator where appropriate
Article Detail
Headline
Featured image
Article body
Author/byline
Publication date/time
Location
Related stories
Share buttons
WhatsApp sharing
Correction/report issue link
Editorial status
Internally:
Draft → Pending Review → Approved → Scheduled → Published → Archived
This connects directly to moderation workflow.

4. BUY & SELL
This is where Eagle Eye Africa becomes more than a newspaper.
Listings Index
Filters:
Category
Price
Location
Date posted
Newest
Price low → high
Price high → low
Categories:
Phones & Electronics
Vehicles
Property
Furniture
Fashion
Jobs/Services
Agriculture
Household
Business Equipment
Other
Listing Detail
Photos
Title
Price
Description
Location
Date posted
Seller/contact information
Reveal-contact button
Share listing
Report listing
Mark as sold
Posting
Poster can:
create listing
upload photos
enter price
describe item
select location
provide contact method
submit for moderation
Lifecycle
Submitted → Moderation → Published → Active → Sold/Expired
listing lifecycle controls such as viewing, extending and force-expiring listings.

5. NOTICES
Notices should not be buried inside news.
Notice categories:
Public Notice
Lost & Found
Road Closure
Community Alert
Missing Person
Service Announcement
Government Notice
School Notice
Church/Community Organization Notice
Other
Each notice gets:
title
description
location
date
expiry date
organization/person posting
contact information
verification status
Important distinction
Official notices should be visually different from ordinary user submissions.
For example:
✓ VERIFIED NOTICE
This becomes particularly useful when government departments, schools, NGOs, organizations and community groups start using Eagle Eye Africa.

6. CULTURE & ENTERTAINMENT
Sections for:
Music
Art
Fashion
Events
Food
Film
Creatives
Community personalities
Festivals
Content can include:
articles
photo galleries
event information
external links
Instagram embeds where appropriate
videos
Event information
Where relevant:
Event name
Date
Time
Venue
Location
Organizer
Ticket/contact information

7. SUBMIT A STORY
This is one of the most important parts of the entire platform.
One CTA:
Submit a Story
Then:
"What are you submitting?"
Photo Story
Community News
Culture
Notice
Buy & Sell
The form dynamically changes depending on selection.
Photo submission
Photos
Caption
Location
Date
What happened?
Contributor name
Phone/email
Consent/rights confirmation
News submission
Headline
Description
What happened?
Where?
When?
Photos
Supporting information
Contact information
Notice
Notice type
Title
Message
Location
Expiry date
Organization/person
Supporting document/image
Buy & Sell
Item
Category
Price
Description
Location
Photos
Contact
Important
No mandatory account should be required to submit.
A lightweight phone/email verification system can be introduced for abuse prevention.

8. ADMIN / EDITORIAL SYSTEM
Without it, the public-facing features become difficult to operate.
Admin Dashboard
Show:
Pending submissions
Pending listings
Pending notices
Published today
Scheduled content
Expiring listings
Active advertisements
Storage usage
Backup status
Storage plan specifies a provider-by-provider usage dashboard and threshold monitoring.

Moderation Queue
Tabs:
All | Stories | News | Listings | Notices | Culture | Ads
Each submission:
Preview → Review → Edit → Approve / Reject / Request clarification
Admin should be able to:
edit headline
edit description
crop/select image
change category
change location
add tags
assign contributor credit
feature content
reject
schedule
publish
archive

1. CONTENT MANAGEMENT
Editorial controls
Draft
Pending
Approved
Scheduled
Published
Archived
Homepage curation
Admin chooses:
Hero story
Secondary stories
Featured Photo Stories
Featured News
Featured Notice
Culture feature
This prevents the homepage from becoming a completely automated feed.

2. USER / ROLE SYSTEM
Roles:
Admin
Everything.
Editor
review
edit
publish
schedule
moderate
Contributor
submit
see own submissions
receive publication notifications
Advertiser
submit ad inquiry
provide creative
view campaign information
Architecture already anticipates role management using roles plus Supabase RLS.

3. ADVERTISING
Advertise page
Explain:
available placements
audience
pricing
formats
campaign duration
contact process
Ad placements
Homepage rail
Homepage banner
Classifieds area
Culture section
Story detail
Sponsored feature
Admin controls
Upload creative
Assign placement
Start date
End date
Active/inactive
Link destination
Roadmap already defines an ad-slot manager with creative uploads, active dates and rail positioning.

4. SEARCH & DISCOVERY
Global search across:
Photo Stories
News
Notices
Buy & Sell
Culture
Search results should show:
Image → Title → Type → Location → Date
Filters:
Content type
Location
Date
Category

5. TRUST & SAFETY
This is extremely important because we’re allowing the public to submit content.
Report content
Spam protection
Phone/email verification
Moderation before publication
Contributor contact information kept private
Terms/consent
Copyright/usage confirmation for submitted photos
Notice verification
Seller reporting
Advertiser verification
Editorial correction
Every news story should have:
Report a correction
This sends a correction request to the editorial team.

6. STORAGE & MEDIA INFRASTRUCTURE
The architecture should deliberately separate storage responsibilities rather than treating every provider as a generic file bucket.
Cloudflare R2
→ public-facing photography
Supabase Storage
→ small admin/user assets
Backblaze B2
→ backup mirror
Cloudinary
→ optional transformation layer
This separation is already defined in the uploaded technical plan.
Backup
Nightly DB backup
Storage mirroring
Backup retention
Manual backup button
Last successful backup timestamp
Restore procedure
The proposed backup approach is two-layered: database dumps plus R2→B2 storage mirroring.

7. SHOULD HAVE
These make the platform substantially better.
Reader features
Save story
Bookmark listing
Recently viewed
Follow a category
Follow a location
Personalized feed
Dark mode
Font-size control
Print article
Reading history
Contributor features
Contributor dashboard
Submission history
Submission status
Edit pending submission
Contributor profile
Published portfolio
Contributor statistics
Buy & Sell
Seller profiles
Favorite listings
Price-drop alerts
"Similar listings"
Seller verification
WhatsApp contact
Listing renewal reminders
Notices
Expiry reminders
Follow a notice category
Follow location
Verified organization profiles
Editorial
Scheduled publishing
Editorial calendar
Bulk moderation
Full audit log
Internal notes
Assignment workflow

8. COULD HAVE
Community
User profiles
Following contributors
Community groups
Comments
Reactions
Polls
Community questions
Public discussions
News
Live updates
Story timelines
Interactive maps
Data journalism
Infographics
Audio articles
Video reports
Marketplace
Seller ratings
Chat
Offers
Reserved items
Featured listings
Paid boosts
Culture
Event calendar
Artist profiles
Venue profiles
Creator directory
Ticket integrations
Advertising
Self-service advertiser dashboard
Campaign management
Impression reporting
Click reporting
Creative A/B testing

9. WON'T HAVE — FOR NOW
This is important.
Don't build initially:
Complex social network
Full messaging system
Native mobile apps
AI-generated news
Cryptocurrency/payment ecosystem
Complicated seller escrow
Massive recommendation engine
Heavy user account requirements
Sophisticated ad marketplace
Over-engineered analytics
Dozens of notification settings
The goal is:
Build the community media engine first.
Then expand.

10. THE EAGLE EYE AFRICA DIFFERENTIATORS
Now we get to the most important part.
These are not simply features that every news website should have.
These are the things that could make Eagle Eye Africa Eagle Eye Africa.

DIFFERENTIATOR #1 — THE COMMUNITY EYE
"Seen by the community. Verified by Eagle Eye."
Anyone can witness something.
Instead of requiring professional journalists for everything, Eagle Eye creates a structured way for ordinary people to contribute.
A contributor submits:
What happened?
Where?
When?
What did you see?
Can we contact you?
Then Eagle Eye verifies and publishes.
Result
The platform becomes a distributed network of community observers.
That's much more defensible than simply publishing articles.

DIFFERENTIATOR #2 — THE AFRICA VISUAL ARCHIVE
This could become one of your biggest long-term assets.
Instead of treating photography as decoration for articles, Eagle Eye treats photographs as the historical record.
Every image can carry:
Location
Date
Photographer
Caption
Event
Category
Story
Over time you create:
A searchable visual archive of African communities.
Imagine searching:
"Bamenda 2026 infrastructure"
and finding hundreds of properly tagged photographs.
That's not just a news website.
That's an institutional memory system.

DIFFERENTIATOR #3 — PLACE-FIRST JOURNALISM
Most news websites organize primarily around:
Politics
Business
Sports
Entertainment
Eagle Eye can organize around:
Where.
For example:
Bamenda
→ News
→ Photos
→ Notices
→ Buy & Sell
→ Events
→ Businesses
→ Community stories
This makes Eagle Eye highly relevant to local communities.

DIFFERENTIATOR #4 — ONE COMMUNITY BOARD
Bring together things people normally find in completely different places:
NEWS + PHOTOS + NOTICES + MARKETPLACE + CULTURE
Someone comes to see what's happening.
They can discover:
Road closure
↓
Community photo
↓
Local business
↓
Event tonight
↓
Item for sale
The platform becomes a digital town square.

DIFFERENTIATOR #5 — VERIFIED COMMUNITY INFORMATION
Introduce a visible trust layer.
For example:
VERIFIED
Officially confirmed by Eagle Eye Africa.
COMMUNITY SUBMISSION
Submitted by a community member.
OFFICIAL SOURCE
Published by an identified organization.
DEVELOPING
Information still being verified.
This creates transparency instead of pretending every piece of information has the same certainty.

DIFFERENTIATOR #6 — THE EAGLE EYE TIMELINE
For major local events, don't just publish one article.
Create a chronological story:
10:15 AM
Residents report flooding.
11:30 AM
Photos submitted.
1:00 PM
Local authority responds.
2:45 PM
Road closure announced.
5:00 PM
Road reopened.
Now the reader gets the story as it unfolds.
This could become a signature Eagle Eye format.

DIFFERENTIATOR #7 — COMMUNITY CONTRIBUTORS BECOME THE NETWORK
Instead of treating contributors as anonymous uploaders, build a contributor identity system.
Example:
Eagle Eye Community Contributor
A contributor gradually builds a record of published work.
Profile:
Sarah N.
12 published stories
28 photographs
Bamenda
Community / Culture / Infrastructure
Now people have a reason to contribute repeatedly.

DIFFERENTIATOR #8 — THE AFRICA MICRO-STORY
Not every story needs 800 words.
Create a distinctive format:
EYE ON THE STREET
One photograph.
One location.
One observation.
50–100 words.
Example:
EYE ON THE STREET — Mankon
6:42 AM. Traders begin setting up before the first heavy traffic reaches the market.
That could become a recognizable Eagle Eye editorial signature.

DIFFERENTIATOR #9 — WHATSAPP-FIRST DISTRIBUTION
For your audience, don't think only:
"Share on Facebook."
Think:
"Send this to someone."
Every major piece should have a beautiful WhatsApp sharing experience.
Potential future feature:
Eagle Eye Daily Brief
A short daily digest:
TODAY'S EAGLE EYE
📸 3 visual stories
📰 3 community stories
📍 2 important notices
🛍 5 interesting listings
🎭 3 culture/events
That becomes a habit.

DIFFERENTIATOR #10 — COMMUNITY MEMORY
This could eventually become Eagle Eye's strongest differentiator.
Allow people to explore:
What happened here before?
A location page could eventually show:
Mankon
2024
2025
2026
Photos
News
Events
Infrastructure
Notices
You're gradually building a living digital memory of places.

DIFFERENTIATOR #11 — "THEN & NOW"
Once your archive becomes large enough:
THEN
Old photograph.
NOW
New photograph.
Same location.
Same angle if possible.
This creates incredibly compelling editorial content while simultaneously building your historical archive.

DIFFERENTIATOR #12 — THE EAGLE EYE MAP
Eventually:

An interactive map showing:
📍 Photo Stories
📍 News
📍 Notices
📍 Events
📍 Buy & Sell
📍 Community issues
Click an area → see what's happening there.
This transforms the platform from a website into a geographic information layer for the community.

EAGLE EYE AFRICA — ADDITIONAL SECTIONS (GAP FILL)
These extend the Master Feature Set. Numbering continues from Section 18.

 1. LEGAL & COMPLIANCE
Not covered anywhere in the original spec — needed before any public submission opens.
Pages
Terms of Service
Privacy Policy
Community Guidelines / Code of Conduct
Copyright & Takedown Policy
Processes
DMCA-style takedown process for the photo archive specifically (separate from the "report content" flow — this is about post-publication disputes, not moderation)
Data retention and account/data deletion requests
Cookie consent banner
Note
The submission form already asks for "consent/rights confirmation" — this section is what happens when that consent is later disputed.

 2. LANGUAGE
Not addressed at all. Worth deciding early since it affects CMS structure, not just UI text.
Core decision
English/French bilingual support (Cameroon is officially bilingual; Bamenda is Anglophone but a national platform likely needs both)
Cameroonian Pidgin (Mboko) and Camfranglais as additional voice/tone options
These aren't just translation targets — they're how the actual audience talks and shares content day-to-day, especially on WhatsApp
Most naturally suited to informal, community-voice formats rather than every piece of content:
Eye on the Street micro-stories (Differentiator #8)
WhatsApp Daily Brief captions (Differentiator #9)
Social/WhatsApp share text distinct from the formal article
Comments/reactions, once built (Section 16)
Full-article translation into Pidgin/Camfranglais is a further-out call — start with tone/voice in the high-distribution formats above rather than treating it as a third full CMS language on day one
Implications
Does each story exist in one language or two (or more)?
Is category/location taxonomy duplicated per language?
Does search work across all languages/registers in use?
Is Pidgin/Camfranglais a full content language, or a tone applied to specific formats — this changes the CMS data model significantly, so decide before building

 3. LOW-BANDWIDTH & ACCESSIBILITY
The target audience is mobile-first on African data plans — this deserves explicit product decisions, not just "responsive layout."
Low-data experience
Lite/low-data mode
Tiered image compression
Offline-friendly reading (cached articles)
Feature-phone reach
SMS or USSD fallback for submissions in low-connectivity areas
Accessibility
Screen reader support
Text scaling (spec already lists "font-size control" — extend to full accessibility pass)

 4. CORE SITE PLUMBING
Assumed by the rest of the spec but never explicitly stated.
Auth
Signup / login
Password reset
Session management (needed to support the Role System in Section 10)
Anti-abuse
CAPTCHA or equivalent at submission, on top of phone/email verification
Standard web infrastructure
404 / error pages
Sitemap.xml
RSS feeds
SEO & sharing
Open Graph / meta tags for link previews
This matters more than usual here, since Differentiator #9 (WhatsApp-First Distribution) depends entirely on shared links rendering well

 5. BUSINESS MODEL GAPS
Advertising section (11) specifies placements and creative upload but stops short of the money and reporting.
Advertising
Payment/invoicing flow for advertisers
Basic performance reporting made available at launch, not deferred to "Could Have" (impression/click reporting currently only appears in Section 16)
Business Directory
A permanent local business/service directory, distinct from Buy & Sell classifieds — for businesses that aren't "selling an item" but want an ongoing presence (shops, restaurants, service providers)
Diaspora
Not named anywhere despite being implied by Differentiators #10 and #11 (Community Memory, Then & Now)
Diaspora users are a natural high-value audience for African local news
Consider a distinct entry point or the daily digest (Section 24) framed for them specifically

 6. ADDITIONAL DIFFERENTIATOR-ADJACENT FEATURES
Small additions that fit naturally alongside the existing differentiators.
Community fundraising
Tied to Notices — e.g. road repair, medical emergencies
Natural extension of "digital town square" positioning
Location pages
Weather widget alongside the Community Memory location view
Distribution
Email digest as an alternative to the WhatsApp Daily Brief (Differentiator #9), for diaspora or users less active on WhatsApp

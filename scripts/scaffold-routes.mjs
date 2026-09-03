import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const routes = [
  // [path, title, description, planned[]]
  ["/photo-stories", "Photo Stories", "Long-form visual journalism from communities across the region.", ["Filters: category, location, date", "Search + sort (latest / featured)", "Index → detail pattern with galleries and photographer credit"]],
  ["/photo-stories/[slug]", "Photo Story", "A single photo story: lead photograph, gallery, captions and credits.", ["Gallery + captions", "Photographer credit → /contributors/[id]", "Location tag → /locations/[place]", "Related stories, prev/next, share + WhatsApp"]],
  ["/news", "Community News", "Hyperlocal news updates, breaking stories and timelines.", ["Filters: category, location", "Featured / breaking indicator"]],
  ["/news/[slug]", "News Article", "A single community news article.", ["Headline, featured image, body, byline", "Report a correction → /news/[slug]/correction", "Timeline article type support", "Related stories, share + WhatsApp"]],
  ["/news/[slug]/correction", "Report a Correction", "Flag a factual error in this article for editorial review.", ["Correction form (Section 13)", "Feeds the admin moderation queue"]],
  ["/buy-sell", "Buy & Sell", "The community marketplace — one board, every place.", ["Filters: category, price, location, date", "Sort: newest / price asc / desc", "Category sub-pages"]],
  ["/buy-sell/[id]", "Listing", "A single buy & sell listing.", ["Photos, title, price, description", "Gated reveal-contact button", "Report listing, mark as sold, similar listings"]],
  ["/buy-sell/post", "Post a Listing", "Post a new buy & sell listing (same form family as /submit?type=buy-sell).", ["Photos + details form", "Feeds moderation queue before publishing"]],
  ["/notices", "Notices", "Official and community notices — road closures, outages, announcements.", ["Filters: notice type, location, verification status"]],
  ["/notices/[id]", "Notice", "A single notice with verification badge and contact info.", ["Verification badge (✓ VERIFIED / COMMUNITY SUBMISSION / OFFICIAL SOURCE / DEVELOPING)", "Date / expiry date", "Contact information, share + WhatsApp"]],
  ["/culture", "Culture & Entertainment", "Music, art, fashion, events, food and film from the community.", ["Sub-sections: music, art, fashion, events, food, film"]],
  ["/culture/[slug]", "Culture Story", "A single culture article, gallery or event.", ["Body content + embeds (Instagram, video)", "Event info block (date, time, venue)", "Related content, share + WhatsApp"]],
  ["/culture/events", "Events", "Community event calendar — what's on, where and when.", ["Calendar view (Section 16)"]],
  ["/culture/events/[id]", "Event", "A single event listing.", ["Date, time, venue → /locations/[place]", "Share + WhatsApp"]],
  ["/submit", "Submit a Story", "Choose what you'd like to share with the community. No account required.", ["Five form variants: photo-story, news, culture, notice, buy-sell", "Lightweight phone/email verification inside the flow", "Feeds the moderation queue (Section 8)"]],
  ["/submit/confirmation", "Submission Received", "Your submission is in the moderation queue. Thank you!", ["Status tracking via /account/dashboard"]],
  ["/search", "Search", "One search across every content type and language.", ["Results grouped by type", "Filters: content type, location, date, category", "Queries across English and French content"]],
  ["/locations", "Locations", "Every place covered — place-first journalism.", ["Index of all places"]],
  ["/locations/[place]", "Location", "Everything from one place: news, stories, notices, listings, events.", ["Community Memory timeline (year-by-year)", "Then & Now pairs", "Weather widget", "Eventually: embedded map pin"]],
  ["/contributors", "Contributors", "Directory of community contributors.", ["Optional/future directory"]],
  ["/contributors/[id]", "Contributor Profile", "A public contributor profile.", ["Name, location, categories", "Published portfolio + stats"]],
  ["/advertise", "Advertise", "Reach the community: placements, audience, pricing and formats.", ["Inquiry form → admin advertiser queue", "Future: self-service campaign dashboard"]],
  ["/about", "About", "What Eagle Eye Africa is and why it exists.", []],
  ["/about/terms", "Terms of Service", "Terms governing use of the platform.", []],
  ["/about/privacy", "Privacy Policy", "How we collect, use and protect your data.", []],
  ["/about/guidelines", "Community Guidelines", "The code of conduct for submissions and interactions.", []],
  ["/about/copyright", "Copyright & Takedown", "Copyright policy and takedown request process.", []],
  ["/about/contact", "Contact", "Get in touch with the editorial team.", []],
  ["/account/login", "Log in", "Log in to your account.", []],
  ["/account/signup", "Sign up", "Create an account.", []],
  ["/account/reset-password", "Reset Password", "Request a password reset link.", []],
  ["/account/dashboard", "Account Dashboard", "Role-dependent dashboard: contributor, advertiser or saved content.", ["Submission history + status", "Edit pending submissions", "Saved stories / bookmarked listings / followed locations"]],
  ["/admin", "Admin", "Editorial back office.", ["Dashboard, moderation, content, users, ads, storage/backup, audit log"]],
  ["/admin/dashboard", "Admin Dashboard", "Counters and status at a glance.", ["Pending submissions counters", "Published today, scheduled content", "Expiring listings, active ads, storage status"]],
  ["/admin/moderation", "Moderation Queue", "Review, edit and publish community submissions.", ["Tabs: All | Stories | News | Listings | Notices | Culture | Ads"]],
  ["/admin/content", "Content Manager", "Draft → published lifecycle + homepage curation.", ["Homepage curation: hero, secondary, featured per section"]],
  ["/admin/users", "User Roles", "Role management: Admin / Editor / Contributor / Advertiser.", []],
  ["/admin/ads", "Ad Manager", "Ad-slot manager: creative, placement, dates.", []],
  ["/admin/storage-backup", "Storage & Backup", "Provider usage, thresholds, manual backup and restore.", []],
  ["/admin/audit-log", "Audit Log", "Who did what, when (Section 15).", []],
];

const pageTemplate = (title, description, planned) => `import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "${title}" };

export default function Page() {
    return (
        <Placeholder
            title="${title}"
            description="${description.replace(/"/g, '\\"')}"
            planned={${JSON.stringify(planned)}}
        />
    );
}
`;

const dynamicTemplate = (title, description, planned, param) => `import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "${title}" };

export default async function Page({
    params,
}: {
    params: Promise<{ ${param}: string }>;
}) {
    const { ${param} } = await params;
    return (
        <Placeholder
            title={\`${title}: \${${param}}\`}
            description="${description.replace(/"/g, '\\"')}"
            planned={${JSON.stringify(planned)}}
        />
    );
}
`;

for (const [route, title, description, planned] of routes) {
  const isDynamic = route.includes("[");
  const param = isDynamic ? route.match(/\[(.+)\]/)[1].replace(/-id$/, "Id") : null;
  const dir = "app" + route;
  mkdirSync(dir, { recursive: true });
  const file = isDynamic
    ? dynamicTemplate(title, description, planned, param)
    : pageTemplate(title, description, planned);
  writeFileSync(`${dir}/page.tsx`, file);
  console.log("created", `${dir}/page.tsx`);
}

// Submit type variants
for (const t of ["photo-story", "news", "culture", "notice", "buy-sell"]) {
  const dir = `app/submit/${t}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}/page.tsx`,
    `import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Submit: ${t}" };

export default function Page() {
    return (
        <Placeholder
            title="Submit a ${t.replace(/-/g, " ")}"
            description="One form component, dynamic fields per submission type. Feeds the moderation queue before publishing."
            planned={["Shared submission → moderation pipeline (Section 8)", "Lightweight phone/email verification step", "Consent step linking to /about/terms and /about/guidelines"]}
        />
    );
}
`
  );
  console.log("created", `${dir}/page.tsx`);
}

console.log("done");
/**
 * Lean-deps gate (audits §4.2): the P1 cut removed single-use / dead UI and
 * map packages. This fails CI if any of them is re-added to `dependencies`,
 * so the 2G bundle budget cannot regress silently.
 *
 * Kept deliberately (live single-use): cmdk (command palette), qrcode
 * (share), leaflet + markercluster (map route, deferred behind flag).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const BANNED_DEPS = [
  "@shadcn/react",
  "embla-carousel-react",
  "react-day-picker",
  "react-resizable-panels",
  "input-otp",
  "leaflet-defaulticon-compatibility",
];

const BANNED_UI_WRAPPERS = [
  "components/ui/calendar.tsx",
  "components/ui/carousel.tsx",
  "components/ui/resizable.tsx",
  "components/ui/input-otp.tsx",
  "components/ui/questionnaire.tsx",
  "components/ui/message-scroller.tsx",
];

const BANNED_CODE_PATHS = [
  // Product verticals cut in P1 — re-adding any file here must be a
  // deliberate, reviewed decision, not an accidental revert.
  "components/live",
  "lib/live",
  "lib/queries/businesses.ts",
  "lib/queries/fundraisers.ts",
  "lib/queries/polls.ts",
  "components/news/poll-card.tsx",
  "components/news/reaction-bar.tsx",
  "components/news/fundraising-section.tsx",
  "components/news/fundraiser-card.tsx",
  "components/news/live-rail.tsx",
  "app/api/billing/campay",
];

let failed = false;
for (const dep of BANNED_DEPS) {
  if (pkg.dependencies?.[dep]) {
    console.error(`[lean-deps] BANNED dependency re-added: ${dep}`);
    failed = true;
  }
}
if (pkg.dependencies?.["@types/leaflet.markercluster"]) {
  console.error("[lean-deps] @types/leaflet.markercluster belongs in devDependencies");
  failed = true;
}

const { existsSync } = await import("node:fs");
for (const rel of [...BANNED_UI_WRAPPERS, ...BANNED_CODE_PATHS]) {
  if (existsSync(join(root, rel))) {
    console.error(`[lean-deps] cut path resurrected: ${rel}`);
    failed = true;
  }
}

if (failed) {
  console.error("[lean-deps] FAIL — see audit cut list (§4).");
  process.exit(1);
}
console.log("[lean-deps] OK — no banned deps or resurrected cut paths.");

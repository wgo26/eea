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
  // Batch 2 (2026-10-14): verified zero importers repo-wide before deletion.
  // Re-adding any of these must be a deliberate, reviewed decision.
  "components/ui/accordion.tsx",
  "components/ui/alert.tsx",
  "components/ui/aspect-ratio.tsx",
  "components/ui/attachment.tsx",
  "components/ui/bubble.tsx",
  "components/ui/button-group.tsx",
  "components/ui/collapsible.tsx",
  "components/ui/combobox.tsx",
  "components/ui/context-menu.tsx",
  "components/ui/direction.tsx",
  "components/ui/empty.tsx",
  "components/ui/field.tsx",
  "components/ui/hover-card.tsx",
  "components/ui/item.tsx",
  "components/ui/marker.tsx",
  "components/ui/menubar.tsx",
  "components/ui/message.tsx",
  "components/ui/native-select.tsx",
  "components/ui/navigation-menu.tsx",
  "components/ui/progress.tsx",
  "components/ui/radio-group.tsx",
  "components/ui/scroll-area.tsx",
  "components/ui/select.tsx",
  "components/ui/sidebar.tsx",
  "components/ui/slider.tsx",
  "components/ui/spinner.tsx",
  "components/ui/switch.tsx",
  "components/ui/table.tsx",
  "components/ui/toast.tsx",
  "components/ui/toggle-group.tsx",
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

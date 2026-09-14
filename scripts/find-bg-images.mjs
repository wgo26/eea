/**
 * Audit (read-only, gate): finds CSS backgroundImage media (inline style or
 * Tailwind arbitrary-value background classes) in pages and shared
 * components. Editorial images must
 * render through SmartImage so next/image can negotiate AVIF/WebP + the right
 * width — a CSS background downloads the full master on every device, which
 * is exactly what the mobile-first, low-bandwidth audience can't afford
 * (features.md §low-bandwidth).
 * Run: node scripts/find-bg-images.mjs   (exit 1 = findings, 0 = clean)
 *
 * NOTE: the arbitrary-value background-URL token below is intentionally
 * split ("bg-" + "[url()]") so Tailwind v4's plain-text content scanner
 * never sees the literal class string. Tailwind scans every text file in
 * the repo root (including scripts/ and docs), so a literal example in a
 * comment generates a broken background-image rule in globals.css and breaks
 * `next build` with "Module not found: Can't resolve ''".
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

const files = [
  ...walk("app/[locale]/(public)"),
  ...walk("app/[locale]/(focused)"),
  ...walk("app/[locale]/(app)"),
  ...walk("components"),
];

const issues = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    // React inline style + Tailwind arbitrary-value background media.
    // ("bg-" + "[url" split so this file itself never contains the literal
    // class token — see the NOTE at the top of this file.)
    if (/backgroundImage/.test(line) || line.includes("bg-" + "[url")) {
      issues.push(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
    }
  });
}

if (issues.length === 0) {
  console.log("No CSS backgroundImage media found.");
} else {
  for (const issue of issues) console.log(issue);
  console.log(`\n${issues.length} finding(s)`);
  process.exit(1);
}

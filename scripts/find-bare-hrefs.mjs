/**
 * Audit (read-only): finds locale-less internal hrefs/actions in public and
 * focused pages, the app shells (admin/account), and shared components — the
 * "drift" the architecture checklist item 7 warns about (nav destinations
 * must be built from the active locale, never bare "/section" constants).
 * Run: node scripts/find-bare-hrefs.mjs
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
    // href="..." / action="..." string literals (not templates, not dynamic)
    const literal = line.match(/\b(?:href|action)="?(\/[^"{}?]*)["?]/);
    if (literal) {
      const target = literal[1];
      if (
        !/^\/(en|fr)(\/|$)/.test(target) &&
        !/^\/(api|_next)/.test(target) &&
        !/\$\{/.test(literal[0])
      ) {
        issues.push(`${file}:${i + 1}  LITERAL  ${line.trim().slice(0, 120)}`);
      }
    }

    // template literals starting with a bare section: `/news?`, `/submit`, …
    const template = line.match(/[`"']\/(?!\/)([a-z-]+)(\?|\/|`)/);
    if (
      template &&
      !/^(en|fr)$/.test(template[1]) &&
      !/^(api|_next|auth\/callback)$/.test(template[1]) &&
      !/locale|\$\{/.test(line) &&
      // paths already flowing through the locale helpers (p = localePath
      // shorthand used by some pages) are locale-safe, not drift.
      !/(\bp\s*\(\s*["'`]|localePath\s*\()/.test(line) &&
      // real navigation context: JSX (>) or explicit router/redirect calls.
      // Config data arrays ({ href: "/about/terms", ... }) are canonical
      // paths consumed through localePath/localeHref at render — not drift.
      /(>|push|replace|redirect)/.test(line)
    ) {
      issues.push(`${file}:${i + 1}  TEMPLATE ${line.trim().slice(0, 120)}`);
    }
  });
}

if (issues.length === 0) {
  console.log("No locale-less internal links found.");
} else {
  for (const issue of issues) console.log(issue);
  console.log(`\n${issues.length} finding(s)`);
}
/**
 * One-off codemod (checklist item 10): converts static `export const metadata`
 * blocks on public index pages into `generateMetadata` that emits the page's
 * own canonical URL + hreflang alternates (en/fr/x-default) via
 * buildAlternates(). Titles/descriptions are preserved verbatim; localized
 * titles are applied by hand afterwards on the main indexes.
 *
 * Run: node scripts/add-alternates.mjs
 * Safe to re-run (skips files that already have generateMetadata).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// file → canonical path (locale-free). Dynamic segments are skipped.
const TARGETS = [
  ["app/[locale]/(public)/about/page.tsx", "/about"],
  ["app/[locale]/(public)/about/contact/page.tsx", "/about/contact"],
  ["app/[locale]/(public)/about/copyright/page.tsx", "/about/copyright"],
  ["app/[locale]/(public)/about/guidelines/page.tsx", "/about/guidelines"],
  ["app/[locale]/(public)/about/privacy/page.tsx", "/about/privacy"],
  ["app/[locale]/(public)/about/terms/page.tsx", "/about/terms"],
  ["app/[locale]/(public)/advertise/page.tsx", "/advertise"],
  ["app/[locale]/(public)/buy-sell/page.tsx", "/buy-sell"],
  ["app/[locale]/(public)/contributors/page.tsx", "/contributors"],
  ["app/[locale]/(public)/culture/page.tsx", "/culture"],
  ["app/[locale]/(public)/culture/events/page.tsx", "/culture/events"],
  ["app/[locale]/(public)/locations/page.tsx", "/locations"],
  ["app/[locale]/(public)/news/page.tsx", "/news"],
  ["app/[locale]/(public)/notices/page.tsx", "/notices"],
  ["app/[locale]/(public)/photo-stories/page.tsx", "/photo-stories"],
  ["app/[locale]/(public)/search/page.tsx", "/search"],
  ["app/[locale]/(public)/submit/page.tsx", "/submit"],
];

const BLOCK_RE = /export const metadata(?:: Metadata)? = \{[\s\S]*?\n?\};/;

function extractString(block, key) {
  const re = new RegExp(`${key}:\\s*"[^"]*"|${key}:\\s*'[^']*'`);
  const m = block.match(re);
  return m ? m[0] : null;
}

function ensureImport(src, from, names, typeOnly = false) {
  // Augment an existing `import { ... } from "<from>"` or append a new line.
  const importRe = new RegExp(
    `import(?:(?:\\s+type)?)\\s*\\{([^}]*)\\}\\s*from\\s*["']${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?`,
  );
  const existing = src.match(importRe);
  if (existing) {
    const inner = existing[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of names) {
      const spec = typeOnly ? `type ${name}` : name;
      if (!inner.some((s) => s.replace(/^type /, "") === name)) inner.push(spec);
    }
    return src.replace(
      importRe,
      `import { ${inner.join(", ")} } from "${from}";`,
    );
  }
  const line = typeOnly
    ? `import type { ${names.join(", ")} } from "${from}";`
    : `import { ${names.join(", ")} } from "${from}";`;
  // insert after the first import line
  const firstImport = src.match(/^import[\s\S]*?;$/m);
  if (firstImport) {
    const idx = src.indexOf(firstImport[0]) + firstImport[0].length;
    return src.slice(0, idx) + `\n${line}` + src.slice(idx);
  }
  return `${line}\n${src}`;
}

let changed = 0;
let skipped = 0;

for (const [rel, canonicalPath] of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`MISSING  ${rel}`);
    skipped++;
    continue;
  }
  let src = fs.readFileSync(file, "utf8");
  if (/generateMetadata/.test(src)) {
    console.log(`SKIP     ${rel} (already has generateMetadata)`);
    skipped++;
    continue;
  }
  const block = src.match(BLOCK_RE);
  if (!block) {
    console.log(`NOBLOCK  ${rel}`);
    skipped++;
    continue;
  }

  const title = extractString(block[0], "title") ?? 'title: "Eagle Eye Africa"';
  const desc = extractString(block[0], "description");

  const lines = [
    "export async function generateMetadata(): Promise<Metadata> {",
    '    const locale = resolveLocale((await headers()).get("x-locale"));',
    "    return {",
    `        ${title.replace(/^title:/, "title:").trim()},`,
    desc ? `        ${desc.trim()},` : null,
    `        alternates: buildAlternates(locale, "${canonicalPath}"),`,
    "    };",
    "}",
  ].filter(Boolean);

  src = src.replace(BLOCK_RE, lines.join("\n"));

  // imports
  if (!/import type \{ Metadata \}/.test(src) && !/import \{ type Metadata/.test(src) && !/Metadata[},]/.test(src.match(/^import type .*next";?/m)?.[0] ?? "")) {
    src = ensureImport(src, "next", ["Metadata"], true);
  }
  src = ensureImport(src, "next/headers", ["headers"]);
  src = ensureImport(src, "@/lib/i18n", ["resolveLocale"]);
  src = ensureImport(src, "@/lib/i18n/urls", ["buildAlternates"]);

  fs.writeFileSync(file, src, "utf8");
  console.log(`OK       ${rel} → ${canonicalPath}`);
  changed++;
}

console.log(`\n${changed} updated, ${skipped} skipped`);
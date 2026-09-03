/**
 * One-off codemod (checklist items 6 + 10): swaps the English title/
 * description literals inside the generateMetadata blocks created by
 * add-alternates.mjs for localized dictionary expressions, and injects the
 * `const dict = getDictionary(locale)` line. Run once:
 *   node scripts/localize-metadata.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// file → [titleExpr, descriptionExpr | null]
const TARGETS = [
  ["app/[locale]/(public)/news/page.tsx", "dict.news.title", "dict.news.tagline"],
  ["app/[locale]/(public)/photo-stories/page.tsx", "dict.photoStories.title", "dict.photoStories.tagline"],
  ["app/[locale]/(public)/buy-sell/page.tsx", "dict.buySell.title", "dict.buySell.tagline"],
  ["app/[locale]/(public)/notices/page.tsx", "dict.notices.title", "dict.notices.tagline"],
  ["app/[locale]/(public)/culture/page.tsx", "dict.culture.title", "dict.culture.tagline"],
  ["app/[locale]/(public)/search/page.tsx", "dict.search.title", null],
  ["app/[locale]/(public)/submit/page.tsx", "dict.submit.title", null],
  ["app/[locale]/(public)/about/page.tsx", "dict.about.title", "dict.about.tagline"],
  ["app/[locale]/(public)/contributors/page.tsx", "dict.contributors.title", "dict.contributors.tagline"],
  ["app/[locale]/(public)/advertise/page.tsx", "dict.advertise.title", "dict.advertise.tagline"],
  ["app/[locale]/(public)/locations/page.tsx", "dict.nav.locations", null],
];

function ensureGetDictionaryImport(src) {
  const importRe =
    /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/i18n["'];?/;
  const existing = src.match(importRe);
  if (existing) {
    const inner = existing[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!inner.includes("getDictionary")) inner.push("getDictionary");
    return src.replace(
      importRe,
      `import { ${[...new Set(inner)].join(", ")} } from "@/lib/i18n";`,
    );
  }
  return src;
}

let changed = 0;

for (const [rel, titleExpr, descExpr] of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`MISSING  ${rel}`);
    continue;
  }
  let src = fs.readFileSync(file, "utf8");

  const blockRe =
    /export async function generateMetadata\(\): Promise<Metadata> \{[\s\S]*?\n\}/;
  const block = src.match(blockRe);
  if (!block) {
    console.log(`NOBLOCK  ${rel}`);
    continue;
  }

  let next = block[0];
  if (!next.includes("getDictionary(locale)")) {
    next = next.replace(
      /const locale = resolveLocale\(\(await headers\(\)\)\.get\("x-locale"\)\);/,
      `const locale = resolveLocale((await headers()).get("x-locale"));\n    const dict = getDictionary(locale);`,
    );
  }
  next = next.replace(/title: "[^"]*",/, `title: ${titleExpr},`);
  if (descExpr) {
    next = next.replace(
      /description:\s*\n?\s*"[^"]*",/,
      `description: ${descExpr},`,
    );
  }

  src = src.replace(blockRe, next);
  src = ensureGetDictionaryImport(src);
  fs.writeFileSync(file, src, "utf8");
  console.log(`OK       ${rel}`);
  changed++;
}

console.log(`\n${changed} updated`);
/**
 * Codemod (checklist item 7): replaces bare `/section` href/action string
 * literals with `localePath(locale, "/section")` in the pages whose moving
 * into app/[locale] made locale-less links drift. Adds the `localePath`
 * import when missing. Skips files that lack a `locale` binding.
 * Run: node scripts/localize-hrefs.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = [
  "app/[locale]/(public)/buy-sell/page.tsx",
  "app/[locale]/(public)/buy-sell/[id]/page.tsx",
  "app/[locale]/(public)/contributors/[id]/page.tsx",
  "app/[locale]/(public)/culture/page.tsx",
  "app/[locale]/(public)/culture/[slug]/page.tsx",
  "app/[locale]/(public)/locations/[place]/page.tsx",
  "app/[locale]/(public)/news/page.tsx",
  "app/[locale]/(public)/news/[slug]/page.tsx",
  "app/[locale]/(public)/notices/page.tsx",
  "app/[locale]/(public)/notices/[id]/page.tsx",
  "app/[locale]/(public)/photo-stories/page.tsx",
  "app/[locale]/(public)/photo-stories/[slug]/page.tsx",
  "app/[locale]/(public)/search/page.tsx",
  "app/[locale]/(focused)/submit/buy-sell/page.tsx",
  "app/[locale]/(focused)/submit/culture/page.tsx",
  "app/[locale]/(focused)/submit/news/page.tsx",
  "app/[locale]/(focused)/submit/notice/page.tsx",
  "app/[locale]/(focused)/submit/photo-story/page.tsx",
  "app/[locale]/(focused)/submit/confirmation/page.tsx",
];

const ATTR_RE = /\b(href|action)="(\/[^"]*)"/g;

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.log(`MISSING  ${rel}`);
    continue;
  }
  let src = fs.readFileSync(file, "utf8");
  const attrs = src.match(ATTR_RE) || [];
  if (attrs.length === 0) continue;

  const hasLocaleBinding =
    /\bconst locale\s*=\s*resolveLocale/.test(src) ||
    /params.*locale|locale\s*=\s*await params/.test(src);
  if (!hasLocaleBinding) {
    console.log(`NOLOCALE ${rel} (${attrs.length} literal link[s])`);
    continue;
  }

  src = src.replace(
    ATTR_RE,
    (match, attr, target) => `${attr}={localePath(locale, ${JSON.stringify(target)})}`,
  );

  if (!/from ["']@\/lib\/i18n\/urls["']/.test(src)) {
    const importLine = 'import { localePath } from "@/lib/i18n/urls";';
    const imports = [...src.matchAll(/^import[^\n]*$/gm)].map((m) => m[0]);
    if (imports.length) {
      const lastImport = imports[imports.length - 1];
      const idx = src.lastIndexOf(lastImport) + lastImport.length;
      src = src.slice(0, idx) + `\n${importLine}` + src.slice(idx);
    } else {
      src = `${importLine}\n${src}`;
    }
  }

  fs.writeFileSync(file, src, "utf8");
  console.log(`OK       ${rel} (${attrs.length} link[s])`);
}
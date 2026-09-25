/**
 * Audit (gate): finds files that start with a UTF-8 BOM (EF BB BF).
 *
 * Why this is a build gate and not a style nit: app/globals.css gained a BOM
 * when it was rewritten by a PowerShell Set-Content/Out-File (PowerShell 5.1
 * writes UTF-8 *with* BOM by default). Tailwind v4 copies that BOM into its
 * PostCSS output, so the generated stylesheet begins with U+FEFF followed by
 * the "tailwindcss v4 - MIT License" banner comment - and lightningcss, the
 * parser Turbopack uses for CSS, then aborts the whole build with a misleading
 * "Invalid dangling combinator in selector" reported on the *second* line
 * (it is a mis-parse of the BOM-prefixed banner comment, not a real selector).
 * A BOM is equally invisible-harmful in .ts/.tsx: it breaks string comparison
 * against file content and trips tooling that assumes a clean UTF-8 lead byte.
 *
 * Fix a hit with: node scripts/find-bom.mjs --fix   (strips the 3 bytes only)
 * Run: node scripts/find-bom.mjs            (exit 1 = findings, 0 = clean)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const FIX = process.argv.includes("--fix");
// Only text files can carry a meaningful BOM for us; skip binary assets.
const TEXTUAL = /\.(?:css|js|mjs|cjs|ts|tsx|jsx|json|md|mdx|html|svg|yml|yaml|sql|txt|env|example)$/i;

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    // Not in a git checkout: fall back to walking the source trees.
    const acc = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (TEXTUAL.test(entry.name)) acc.push(p);
      }
    };
    for (const d of ["app", "components", "lib", "scripts", "hooks", "supabase", "tests"]) walk(d);
    return acc;
  }
}

const hits = [];
for (const file of trackedFiles()) {
  if (!TEXTUAL.test(path.basename(file))) continue;
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const head = Buffer.alloc(3);
    const read = fs.readSync(fd, head, 0, 3, 0);
    if (read === 3 && head.equals(BOM)) hits.push(file);
  } catch {
    continue; // deleted-from-worktree index entry, unreadable, etc.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

if (hits.length === 0) {
  console.log("No UTF-8 BOMs found.");
} else if (FIX) {
  for (const file of hits) {
    const buf = fs.readFileSync(file);
    fs.writeFileSync(file, buf.subarray(3));
    console.log(`stripped BOM: ${file}`);
  }
  console.log(`\n${hits.length} file(s) fixed.`);
} else {
  for (const file of hits) console.log(`${file}  UTF-8 BOM`);
  console.log("");
  console.log(`${hits.length} BOM finding(s).`);
  console.log("A BOM in app/globals.css breaks 'next build': Tailwind copies it into the");
  console.log("generated CSS and lightningcss aborts with a bogus");
  console.log('"Invalid dangling combinator in selector".');
  console.log("Strip them with:   node scripts/find-bom.mjs --fix");
  console.log("Avoid writing them: PowerShell Set-Content/Out-File default to UTF-8-BOM.");
  process.exit(1);
}

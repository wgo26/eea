// Temporary profiling script — safely walks the repo, prints ops for cross-check.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd?.() || '.';
const MAX_DEPTH = 4;

function isIgnored(name) {
  return name === 'node_modules' || name === '.next' || name === '.git';
}

function listDirsAbs(startDir) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || isIgnored(e.name)) continue;
      const abs = join(dir, e.name);
      out.push(abs);
      walk(abs, depth + 1);
    }
  };
  walk(startDir, 0);
  return out;
}

function globDeep(startDir, matcherName) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 12) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (depth < 9 && (e.name === 'node_modules' || e.name === '.next' || e.name === '.git')) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) { walk(abs, depth + 1); continue; }
      if (Array.isArray(matcherName)) {
        if (matcherName.some((m) => e.name === m)) out.push(abs);
      } else if (matcherName === 'ALL') {
        out.push(abs);
      }
    }
  };
  walk(startDir, 0);
  return out;
}

function shortOn(p, root) { return p.replace(root, ''); }

function getFilesInDir(abs) {
  try { return readdirSync(abs, { withFileTypes: true }); } catch { return []; }
}

// 1. root
console.log('ROOT=' + ROOT);

// 2. app dirs
{
  const appDir = join(ROOT, 'app');
  console.log('\n== top-level entries ==');
  for (const e of getFilesInDir(ROOT)) console.log('  ' + (e.isDirectory() ? '[D] ' : '    ') + e.name);
  console.log('\n== locale dir first entry check ==');
  for (const e of getFilesInDir(appDir)) {
    if (!e.isDirectory()) continue;
    console.log('APP_LOCALE_VENTRY=' + e.name);
    const sub = join(appDir, e.name);
    for (const s of getFilesInDir(sub)) console.log('  "(' + s.name + ')"' + (s.isDirectory() ? '/' : ''));
    console.log('  --end ' + e.name + '--');
  }
}

// 3. find all page.tsx / route handlers
{
  const all = globDeep(ROOT, ['page.tsx', 'route.ts', 'layout.tsx', 'globals.css']);
  console.log('\n== BINDING_PROBE (' + all.length + ' rows) ==');
  for (const f of all) console.log('  ' + shortOn(f, ROOT));
}

// 4. matches for serialization / locales
{
  const appDir = join(ROOT, 'app');
  const localeMatches = [];
  const appLocale = join(appDir, '[locale]');
  const collect = (dir, depth) => {
    if (depth > 10) return;
    const entries = getFilesInDir(dir);
    for (const e of entries) {
      if (e.isDirectory()) collect(join(dir, e.name), depth + 1);
      else if (e.name === 'serialization.ts' || e.name === 'serialization2.ts' || e.name.endsWith('serialization.ts')
        || e.name === 'proxy.ts' || e.name === 'middleware.ts') localeMatches.push(shortOn(join(dir, e.name), ROOT));
    }
  };
  if (existsSync(appLocale)) collect(appLocale, 0);
  console.log('\n== SERIALIZATION/PROXY_MATCH (' + localeMatches.length + ' rows) ==');
  for (const m of localeMatches) console.log('  ' + m);
}

// 5. dirs-of-interest under [locale]
{
  console.log('\n== DIRS_OF_INTEREST ==');
  const roots = {
    '[locale]': join(ROOT, 'app', '[locale]'),
    '[root]': ROOT,
  };
  const key = '[locale]';
  const interesting = [];
  const walkInteresting = (dir, depth) => {
    if (depth > 9) return;
    const entries = getFilesInDir(dir);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const n = e.name;
      if (n === 'node_modules' || n === '.next' || n === '.git') continue;
      if (n === '[locale]') continue;
      interesting.push(n);
      walkInteresting(join(dir, e.name), depth + 1);
    }
  };
  walkInteresting(roots[key], 0);
  // Only show the unique names
  const uniq = [...new Set(interesting)].sort();
  console.log('  UNIQUE_NAMES_COUNT=' + uniq.length);
  console.log('  ' + uniq.join(' | '));
}

// 6. serialization & profile-adjacent files
{
  console.log('\n== KEY_PROFILE_FILES ==');
  const needles = ['globals.css', 'page.tsx', 'loading.tsx', 'error.tsx', 'layout.tsx', 'opengraph-image.tsx', 'x.svg', 'runtime.js', 'app.ts'];
  for (const n of needles) {
    const matched = globDeep(ROOT, [n]);
    console.log('  FOR[' + n + ']=' + matched.length);
    matched.slice(0, 12).forEach((m) => console.log('      ' + shortOn(m, ROOT)));
  }
}

// 7. package.json files/scripts
{
  const p = join(ROOT, 'package.json');
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      console.log('\n== PACKAGE_JSON ==');
      console.log('  scripts: ' + (Object.keys(j.scripts || {}).join(', ')));
      console.log('  files: ' + JSON.stringify(j.files));
    } catch (e) { console.log('  package.json parse err ' + e.message); }
  } else console.log('\n== PACKAGE_JSON MISSING ==');
}

console.log('\nDONE_PROBE');

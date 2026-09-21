const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'app', '[locale]', '(app)', 'admin', 'trust-safety', 'page.tsx');
let s = fs.readFileSync(p, 'utf8');
let changed = false;

// 1. Fix pageHref - remove qs reference
const oldPageHref = 'const pageHref = (p: number) => `${base}?tab=${tab}&status=${status}${qs}&page=${p}`';
const newPageHref = 'const pageHref = (p: number) => `${base}?tab=${tab}&status=${status}&page=${p}`';
if (s.includes(oldPageHref)) {
  s = s.replace(oldPageHref, newPageHref);
  changed = true;
}

// 2. Fix EmptyState message - remove search check
const oldMsg = "message={status === 'all' && !search ? t.emptyReports : tc.emptyFiltered}";
const newMsg = "message={status === 'all' ? t.emptyReports : tc.emptyFiltered}";
if (s.includes(oldMsg)) {
  s = s.replace(oldMsg, newMsg);
  changed = true;
}

// 3. Remove secondaryAction block from EmptyState
const oldSecondary = `            secondaryAction={
              <Link
                href={localePath(locale, '/admin/trust-safety')}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tc.clearFilters}
              </Link>
            }`;
const newSecondary = '';
if (s.includes(oldSecondary)) {
  s = s.replace(oldSecondary, newSecondary);
  changed = true;
}

// 4. Remove unused SearchBar import
s = s.replace(/import { SearchBar } from '@\/components\/admin\/filter-pills'\n/, '');
changed = true;

// 5. Remove Link import if no longer used - check later

// 6. Clean up extra blank lines
s = s.replace(/\n\n\n\n/g, '\n\n');

fs.writeFileSync(p, s);
console.log('Done fixing trust-safety, changed:', changed);

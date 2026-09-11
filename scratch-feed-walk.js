const fs = require('fs');
const path = require('path');
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}
const all = walk('Blogger');
const rss = all.filter((f) => /\.(rss|xml|atom)$/i.test(f));
console.log('feed-like files:', rss.length);
rss.slice(0, 20).forEach((f) => console.log(' ', f));

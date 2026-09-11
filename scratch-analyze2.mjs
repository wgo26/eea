import { readFileSync } from 'node:fs'

const xml = readFileSync('docs/Blogger/Blogs/EAGLE EYE AFRICA/feed.atom', 'utf8')
const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) ?? []
const typeOf = (e) => e.match(/<blogger:type\b[^>]*>([^<]*)<\/blogger:type>/i)?.[1]?.trim() ?? '(none)'

// 1) A POST entry WITH labeled categories
const labeled = entries.find((e) => typeOf(e) === 'POST' && /<category\b[^>]*\bterm=/.test(e))
console.log('=== POST entry with labeled categories (trimmed) ===')
if (labeled) {
  const short = labeled.replace(/<content[\s\S]*?<\/content>/i, '<content>…</content>')
  console.log(short.slice(0, 2500))
} else {
  console.log('NONE FOUND')
}

// 2) Distinct category tag shapes
const cats = [...xml.matchAll(/<category\b[^>]*>/gi)].map((m) => m[0])
const uniq = [...new Set(cats)]
console.log(`\n=== distinct category tags: ${uniq.length} (of ${cats.length} total) ===`)
uniq.forEach((t) => console.log(t))

// 3) COMMENT entry
const c = entries.find((e) => typeOf(e) === 'COMMENT')
console.log('\n=== COMMENT entry (trimmed) ===')
console.log(c ? c.replace(/<content[\s\S]*?<\/content>/i, '<content>…</content>').slice(0, 1500) : 'NONE')

// 4) PAGE entry
const p = entries.find((e) => typeOf(e) === 'PAGE')
console.log('\n=== PAGE entry (trimmed) ===')
console.log(p ? p.replace(/<content[\s\S]*?<\/content>/i, '<content>…</content>').slice(0, 1500) : 'NONE')

// 5) author uri shapes + trashed with content?
const uris = [...new Set([...xml.matchAll(/<uri>([^<]*)<\/uri>/gi)].map((m) => m[1]))]
console.log('\n=== author URIs ===')
uris.forEach((u) => console.log(u))
console.log('trashed markers with content:', (xml.match(/<blogger:trashed>[^<]+<\/blogger:trashed>/gi) ?? []).length)
console.log('trashed empty markers:', (xml.match(/<blogger:trashed\s*\/>/gi) ?? []).length)
console.log('blogger:status DRAFT count:', entries.filter((e) => /<blogger:status>\s*DRAFT\s*<\/blogger:status>/i.test(e)).length)

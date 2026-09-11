import fs from 'node:fs'
const p = process.argv[2]
const xml = fs.readFileSync(p, 'utf8')
const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) ?? []
const type = {}
const status = {}
for (const e of entries) {
  const t = e.match(/<blogger:type\b[^>]*>([^<]*)<\/blogger:type>/i)?.[1]?.trim() || '(none)'
  const s = e.match(/<blogger:status\b[^>]*>([^<]*)<\/blogger:status>/i)?.[1]?.trim() || '(none)'
  type[t] = (type[t] ?? 0) + 1
  status[s] = (status[s] ?? 0) + 1
}
console.log('entries:', entries.length)
console.log('types:', type)
console.log('statuses:', status)
const catWithTerm = (xml.match(/<category\b[^>]*\bterm=/gi) ?? []).length
const catTotal = (xml.match(/<category\b[^>]*>/gi) ?? []).length
console.log('categories total:', catTotal, 'with term attr:', catWithTerm)
const cats = [...new Set((xml.match(/<category\b[^>]*\bterm=(["'])(.*?)\1[^>]*>/gi) ?? []).map((s) => s.slice(0, 200)))]
console.log('distinct category tag shapes (up to 10):')
for (const c of cats.slice(0, 10)) console.log('  ', c)
console.log('alt links:', (xml.match(/<link\b[^>]*\brel=(["'])alternate\1/gi) ?? []).length)
console.log('link elements:', (xml.match(/<link\b/gi) ?? []).length)
console.log('filenames:', (xml.match(/<blogger:filename>/gi) ?? []).length)
console.log('cdata contents:', (xml.match(/<!\[CDATA\[/g) ?? []).length)
console.log('blogger:parent (comments):', (xml.match(/<blogger:parent>/gi) ?? []).length)
const trashedFilled = (xml.match(/<blogger:trashed>[^<]+<\/blogger:trashed>/gi) ?? []).length
const trashedAny = (xml.match(/<blogger:trashed\b/gi) ?? []).length
console.log('trashed markers:', trashedAny, 'filled:', trashedFilled)
const dates = (xml.match(/<published>([^<]+)<\/published>/gi) ?? []).map((s) => s.replace(/<\/?published>/g, ''))
dates.sort()
console.log('date range:', dates[0], '->', dates[dates.length - 1])
console.log('images referenced:', (xml.match(/<img\b/gi) ?? []).length)
// Print one short entry that has a non-empty category term, if any
const withTerm = entries.find((e) => /<category\b[^>]*\bterm=(["'])[^"']+\1/i.test(e))
if (withTerm) console.log('\nSAMPLE entry with term:\n', withTerm.slice(0, 1500))

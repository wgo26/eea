import { readFileSync } from 'node:fs'
const c = readFileSync('docs/Blogger/Blogs/EAGLE EYE AFRICA/feed.atom', 'utf8')
const entries = c.match(/<entry>[\s\S]*?<\/entry>/g) || []
const stats = {}
let catTerms = 0, locs = 0, meta = 0, enc = 0, link = 0, fn = 0, trashed = 0
const imgUrls = new Set()
const ytEmbeds = new Set()
const localVids = new Set()
const locVals = new Set()
const fnames = []
for (const e of entries) {
  const t = (e.match(/<blogger:type>([^<]*)<\/blogger:type>/) || [])[1]
  const s = (e.match(/<blogger:status>([^<]*)<\/blogger:status>/) || [])[1]
  const k = `${t}/${s}`
  stats[k] = (stats[k] || 0) + 1
  const fnm = (e.match(/<blogger:filename>([^<]*)<\/blogger:filename>/) || [])[1]
  if (fnm) { fn++; fnames.push(fnm) }
  if (/<category term=/.test(e)) catTerms++
  const loc = (e.match(/<blogger:location>([^<]*)<\/blogger:location>/) || [])[1]
  if (loc) { locs++; locVals.add(loc) }
  const md = (e.match(/<blogger:metaDescription>([^<]*)<\/blogger:metaDescription>/) || [])[1]
  if (md) meta++
  if (/<enclosure[^>]*url=/.test(e)) enc++
  if (/<link[^>]*href=/.test(e)) link++
  if (/<blogger:trashed>[^<]/.test(e)) trashed++
  for (const m of e.matchAll(/src="(https:\/\/blogger\.googleusercontent\.com[^"]+)"/g)) imgUrls.add(m[1])
  for (const m of e.matchAll(/<iframe[^>]*src="([^"]*(youtube|youtu\.be)[^"]*)"/g)) ytEmbeds.add(m[1])
  for (const m of e.matchAll(/src="([^"]*\.mp4[^"]*)"/g)) localVids.add(m[1])
}
console.log('entries:', entries.length)
console.log('type/status:', JSON.stringify(stats, null, 1))
console.log('filename tags:', fn, '| category terms:', catTerms, '| locations:', locs, '| metaDesc:', meta, '| enclosure urls:', enc, '| link hrefs:', link, '| trashed:', trashed)
console.log('blogger img urls:', imgUrls.size, '| youtube embeds:', ytEmbeds.size, '| local mp4 refs:', localVids.size)
console.log('location values:', [...locVals].join(' | '))
const base = new Set()
for (const u of imgUrls) { const seg = u.split('/').pop(); if (seg && seg.includes('.')) base.add(decodeURIComponent(seg)) }
console.log('distinct img basenames:', base.size)
console.log([...base].slice(0, 30).join(', '))
// duplicate titles / filenames?
const seen = new Map()
for (const f of fnames) seen.set(f, (seen.get(f) || 0) + 1)
const dups = [...seen.entries()].filter(([, n]) => n > 1)
console.log('duplicate filenames:', dups.length, JSON.stringify(dups.slice(0, 10)))
// sample of one LIVE entry metadata region
const live = entries.find((e) => /<blogger:status>LIVE<\/blogger:status>/.test(e))
const tail = live.match(/<blogger:metaDescription[\s\S]*$/)
console.log('--- sample LIVE entry tail ---')
console.log(tail ? tail[0].slice(0, 600) : 'none')

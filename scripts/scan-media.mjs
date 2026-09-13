// Audit: backgroundImage + SmartImage coverage across tracked tsx files.
// Usage: node scripts/scan-media.mjs [pattern]
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const only = process.argv[1] // optional substring filter
const files = execSync('git ls-files "*.tsx" "*.ts"')
  .toString()
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

let bg = []
let si = []
for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('backgroundImage')) bg.push(`${f}:${i + 1}: ${line.trim()}`)
    if (line.includes('SmartImage')) si.push(`${f}:${i + 1}`)
  }
}

console.log(`== backgroundImage (${bg.length}) ==`)
for (const l of bg) console.log(l)
console.log(`\n== SmartImage references (${si.length} files ==`)
for (const l of si.sort()) console.log(l)
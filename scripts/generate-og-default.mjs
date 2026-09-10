/**
 * Generate the default social-share card (public/og-default.png, 1200×630)
 * used by every route that does not set its own og:image (homepage, section
 * indexes, advertise, locations, search). Uses sharp (already a dependency)
 * so it runs on any machine.
 *
 *   node scripts/generate-og-default.mjs
 *
 * The output is committed; the root layout's openGraph/twitter metadata
 * points at /og-default.png (resolved to an absolute URL via metadataBase).
 * Re-run + commit whenever the brand mark or tagline changes.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const OUT = "public/og-default.png";
const W = 1200;
const H = 630;

// Brand palette — mirrors the built-in icon (app icon / icon.svg).
const BG = "#0f172a"; // slate-900
const ACCENT = "#f59e0b"; // amber-500
const FG = "#f8fafc"; // slate-50
const MUTED = "#94a3b8"; // slate-400

const eyeMark = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 64 64">
  <g fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round">
    <path d="M8 32c6-9 14-14 24-14s18 5 24 14c-6 9-14 14-24 14S14 41 8 32z"/>
    <circle cx="32" cy="32" r="7" fill="${ACCENT}" stroke="none"/>
  </g>
</svg>
`);

const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <!-- subtle accent underline -->
  <rect x="80" y="392" width="96" height="6" rx="3" fill="${ACCENT}"/>
  <text x="80" y="360" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="bold" fill="${FG}">Eagle Eye Africa</text>
  <text x="80" y="452" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${MUTED}">Community news, photo stories &amp; local life — one board for every place.</text>
</svg>
`);

const eye = sharp(eyeMark).png();
const card = sharp(svg)
  .composite([
    { input: await eye.toBuffer(), left: 80, top: 80 },
  ])
  .png();

mkdirSync("public", { recursive: true });
await card.toFile(OUT);
console.log(`Wrote ${OUT} (${W}x${H}).`);

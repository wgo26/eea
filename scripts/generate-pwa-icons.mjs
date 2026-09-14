/**
 * Generate PWA icons (public/icons/icon-192.png, icon-512.png,
 * icon-512-maskable.png) for the web manifest (app/manifest.ts).
 * Uses sharp (already a dependency) so it runs on any machine.
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * The output is committed. Brand palette + eye mark mirror
 * scripts/generate-og-default.mjs. The maskable icon keeps the mark inside
 * the 80% safe zone so launchers can crop it into any shape.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BG = "#0f172a"; // slate-900
const ACCENT = "#f59e0b"; // amber-500

function iconSvg(size, markScale, markOffset) {
  const m = markScale;
  const o = markOffset;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>
  <g fill="none" stroke="${ACCENT}" stroke-width="${size * 0.055}" stroke-linecap="round" transform="translate(${o},${o}) scale(${m})">
    <path d="M8 32c6-9 14-14 24-14s18 5 24 14c-6 9-14 14-24 14S14 41 8 32z"/>
    <circle cx="32" cy="32" r="7" fill="${ACCENT}" stroke="none"/>
  </g>
</svg>
`);
}

// The eye mark is drawn on a 64-unit grid; scale it to fill the icon.
async function writeIcon(out, size, fitted) {
  const scale = fitted ? size / 64 : (size * 0.8) / 64;
  const offset = fitted ? 0 : size * 0.1;
  await sharp(iconSvg(size, scale, offset)).png().toFile(out);
  console.log(`Wrote ${out} (${size}x${size}).`);
}

mkdirSync("public/icons", { recursive: true });
await writeIcon("public/icons/icon-192.png", 192, true);
await writeIcon("public/icons/icon-512.png", 512, true);
await writeIcon("public/icons/icon-512-maskable.png", 512, false);

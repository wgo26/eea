import { chromeEn } from './chrome-en'
import { chromeFr } from './chrome-fr'
import type { Locale } from './config'

/**
 * A2 — the only dictionary module anonymous client chrome may import.
 *
 * `chrome-en.ts` / `chrome-fr.ts` carry just the header/footer/theme/
 * palette strings (~4 KB source) and import nothing but types, so a client
 * component importing THIS module can never pull `en.ts` / `fr.ts` (and
 * their `...appStrings*` admin vocabulary) into the public bundle.
 *
 * Server code keeps using `getDictionary` (full Dictionary incl. admin).
 * The split is enforced by scripts/verify-client-dictionary.mjs in
 * `npm run check`.
 */
export type ChromeStrings = typeof chromeEn

const chrome: Record<Locale, ChromeStrings> = { en: chromeEn, fr: chromeFr }

export function getChromeStrings(locale: Locale): ChromeStrings {
  return chrome[locale]
}

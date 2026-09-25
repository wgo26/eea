import 'server-only'

import { NORMAL_STATE_ID } from '@/lib/platform/state-engine'
import { loadActiveThemeRecord, type ThemeRecord } from './index'
import {
  DEFAULT_BRAND_THEME,
  composeTheme,
  serializeTheme,
  type BrandTheme,
} from './tokens'

/**
 * The published theme as the DOCUMENT shell renders it (gap 1).
 *
 * Deliberately narrower than `resolveEffectiveTheme()`, which composes the
 * active system state and the reader's accessibility preference on top of the
 * brand. Leaving both layers out here is load-bearing, not tidiness:
 *
 *  1. **ISR.** The state layer needs `getActiveStates()` — an uncached, untagged
 *     direct read. Reaching for it from `app/layout.tsx` either bakes whichever
 *     state was live at generation time into up to five minutes of static HTML
 *     (an incident palette stranded on pages rendered after it cleared, and the
 *     reverse) or forces every public page into per-request rendering. The brand
 *     read below is already `unstable_cache`'d on the `brand` tag, so the
 *     document shell stays prerenderable and still repaints the moment a theme
 *     publishes.
 *  2. **Accessibility precedence.** `app/globals.css` raises the reader's
 *     high-contrast ramp to `html.high-contrast` (0,1,1) and
 *     `html.high-contrast.dark` (0,2,1). This module's output must therefore
 *     stay at `:root` / `.dark` (0,1,0) so branding beats the shipped baseline
 *     on document ORDER only, and a reader's contrast setting keeps beating
 *     branding on SPECIFICITY. Composing a state palette into the document would
 *     let a brand change out-vote an accessibility guarantee.
 *
 * State atmosphere still reaches the surfaces that render it live (the admin
 * shell's `data-state-motion`, the preview engine, and `resolveEffectiveTheme()`
 * for any dynamic surface). Moving it into the public document is a separate
 * decision that first needs the state read cached and tagged.
 */
export interface DocumentTheme {
  theme: BrandTheme
  /** Name of the published theme, or null when the baseline is in force. */
  themeName: string | null
  /** True when no theme is published, so the injected block adds nothing. */
  isBaseline: boolean
  /** `:root` then `.dark` rules, in that order, ready for `<style>` injection. */
  css: string
}

/**
 * The pure half of `loadDocumentTheme`, split out so it is testable without a
 * DB. Typed by what it reads rather than the whole row: the document paints the
 * identity, so `status`, `isActive` and the audit columns deliberately cannot be
 * reached from here.
 */
export function documentThemeFromRecord(
  record: Pick<ThemeRecord, 'name' | 'tokens'> | null,
): DocumentTheme {
  // NORMAL carries no deviations, so this states the intent (identity,
  // uncomposed) without changing a single value.
  const theme = composeTheme(record?.tokens ?? DEFAULT_BRAND_THEME, NORMAL_STATE_ID)
  return {
    theme,
    themeName: record?.name ?? null,
    isBaseline: record === null,
    css: serializeTheme(theme),
  }
}

/**
 * The active brand with no state or accessibility layer applied. Safe to await
 * from a statically generated layout: the read underneath is cached and tagged,
 * and both a missing database and a failed read fall back to the shipped
 * baseline instead of throwing at render time.
 */
export async function loadDocumentTheme(): Promise<DocumentTheme> {
  return documentThemeFromRecord(await loadActiveThemeRecord())
}

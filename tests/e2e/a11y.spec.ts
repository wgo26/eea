import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Phase 3 acceptance — axe clean on every covered route (WCAG 2.0/2.1 A+AA).
 *
 * Covers both locales, both viewports (desktop + Pixel 5 projects), and the
 * Phase 3/4 surfaces: verification explainer, offline fallback, map, street
 * index, and the stepped submit flow. Runs against `next start` with dummy
 * Supabase env, so pages render their no-database fallbacks — the
 * landmarks, labels, contrast and keyboard surface under test is identical.
 */
const ROUTES = [
  '/en',
  '/fr',
  '/en/news',
  '/en/photo-stories',
  '/en/notices',
  '/en/buy-sell',
  '/en/culture',
  '/en/culture/events',
  '/en/locations',
  '/en/map',
  '/en/street',
  '/en/search?q=market',
  '/en/submit',
  // Phase 2: the flows keyboard users struggle with most — focused intake,
  // auth shell and advertiser entry — were previously unaxe'd.
  '/en/submit/notice',
  '/en/submit/confirmation',
  '/en/account/login',
  '/en/advertise',
  '/en/contributors',
  '/en/about',
  '/en/about/verification',
  '/en/digest',
  '/en/offline',
  '/fr/about/verification',
  '/fr/submit/notice',
]

for (const route of ROUTES) {
  test(`axe: ${route} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      results.violations,
      `${route} axe violations:\n${results.violations
        .map((v) => ` - ${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.helpUrl}`)
        .join('\n')}`,
    ).toEqual([])
  })
}

test('keyboard: skip link reaches main content on /en', async ({ page }) => {
  await page.goto('/en', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('href', '#main-content')
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})

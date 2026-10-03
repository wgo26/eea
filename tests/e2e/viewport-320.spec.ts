import { expect, test, type Page } from '@playwright/test'

/**
 * Batch B — 320px small-phone smoke (narrowest contracted viewport).
 *
 * The responsive contract is 320 / 390 / 768 / 1024 / 1280 per shell; the
 * Playwright projects cover desktop + Pixel 5 (390px), so this file pins the
 * 320px floor explicitly: public index, focused auth card, focused submit
 * form, and the admin/account guard redirect targets must all render with
 * no horizontal overflow and their core action reachable.
 *
 * Admin/account shells need a staff session, which the dummy-backend harness
 * cannot mint — those routes are asserted at their guard boundary (redirect
 * to localized login, no crash, no overflow on the landing page). Full
 * authenticated-shell 320px coverage needs session fixtures (follow-up).
 */
test.use({ viewport: { width: 320, height: 568 } })

async function expectNoHScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'horizontal overflow at 320px').toBeLessThanOrEqual(1)
}

for (const route of ['/en', '/fr', '/en/account/login', '/fr/account/login', '/en/submit/notice']) {
  test(`320px: ${route} renders without horizontal scroll`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoHScroll(page)
  })
}

test('320px: focused auth card keeps its back path', async ({ page }) => {
  await page.goto('/fr/account/login', { waitUntil: 'networkidle' })
  await expect(page.getByRole('link').first()).toBeVisible()
  await expectNoHScroll(page)
})

test('320px: focused skip link reaches main content', async ({ page }) => {
  await page.goto('/en/account/login', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('href', '#main-content')
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
})

for (const route of ['/en/admin/dashboard', '/fr/admin/moderation', '/en/account/dashboard']) {
  test(`320px: guarded ${route} redirects without crashing`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/account\/login|\/not-authorized/)
    await expectNoHScroll(page)
  })
}

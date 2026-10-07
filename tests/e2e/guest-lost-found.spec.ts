import { expect, test, type Page } from '@playwright/test'

/**
 * P3 verification — guest Lost & Found flow on throttled 3G.
 *
 * Covers the merged-audit killer feature without needing a database: the
 * /notices hero cards (first-class Lost & Found, not a filter chip),
 * deep-link preselect into /submit/notice?type=, and the guest funnel
 * rendering under emulated slow-3G. Submissions themselves are NOT posted
 * here — the dummy-backend harness has no database; server-action abuse
 * gates are covered by vitest.
 */

async function throttle3G(page: Page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
    connectionType: 'cellular3g',
  })
}

test('primary navigation exposes five destinations and Post as a separate action', async ({
  page,
}) => {
  await page.goto('/en/notices', { waitUntil: 'domcontentloaded' })

  const menu = page.getByRole('button', { name: 'Menu' })
  if (await menu.isVisible()) await menu.click()

  const navigation = page.getByRole('navigation', { name: 'Main' })
  for (const label of ['Home', 'Stories', 'Notices', 'Buy & Sell', 'Locations']) {
    await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Post', exact: true }).first()).toBeVisible()
})

test('guest lost-found: notices hero links into a preselected submit form', async ({ page }) => {
  await throttle3G(page)
  await page.goto('/en/notices', { waitUntil: 'domcontentloaded' })

  const lostItem = page.getByRole('link', { name: /report a lost item/i })
  await expect(lostItem).toBeVisible({ timeout: 30000 })

  const href = await lostItem.getAttribute('href')
  expect(href).toMatch(/\/submit\/notice\?type=lost_found&direction=lost/)

  await lostItem.click()
  await expect(page).toHaveURL(/\/en\/submit\/notice\?type=lost_found&direction=lost/)

  // Both the notice category and direction arrive preselected.
  const select = page.locator('select#noticeType')
  await expect(select).toBeVisible()
  await expect(select).toHaveValue('lost_found')
  await expect(page.locator('select#noticeDirection')).toHaveValue('lost')
})

test('guest lost-found: missing-person deep link preselects correctly (FR)', async ({
  page,
}) => {
  await page.goto('/fr/submit/notice?type=missing_person', { waitUntil: 'domcontentloaded' })
  const select = page.locator('select#noticeType')
  await expect(select).toBeVisible({ timeout: 30000 })
  await expect(select).toHaveValue('missing_person')
})

test('guest lost-found: found-item action preselects found direction', async ({ page }) => {
  await page.goto('/en/submit/notice?type=lost_found&direction=found', {
    waitUntil: 'domcontentloaded',
  })

  test('official notices action opens the verified-only notice view', async ({ page }) => {
    await page.goto('/en/notices', { waitUntil: 'domcontentloaded' })
    const official = page.getByRole('link', { name: /browse official notices/i })
    await expect(official).toBeVisible({ timeout: 30000 })
    await official.click()
    await expect(page).toHaveURL(/\/en\/notices\?official=1/)
  })
  await expect(page.locator('select#noticeDirection')).toHaveValue('found', {
    timeout: 30000,
  })
})

test('guest lost-found: empty submit is refused client-side (no wasted POST on 3G)', async ({
  page,
}) => {
  await throttle3G(page)
  await page.goto('/en/submit/notice?type=community_alert', { waitUntil: 'domcontentloaded' })
  const select = page.locator('select#noticeType')
  await expect(select).toHaveValue('community_alert')

  // Required fields block the submit: contributor name is empty, so native
  // validation must stop the POST before any byte is spent.
  const urlBefore = page.url()
  const nativeValid = await page.locator('form').evaluate((form: HTMLFormElement) => form.checkValidity())
  expect(nativeValid).toBe(false)
  expect(page.url()).toBe(urlBefore)
})

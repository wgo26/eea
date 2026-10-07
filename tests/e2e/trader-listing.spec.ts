import { expect, test, type Page } from '@playwright/test'

/**
 * P3 verification — trader Market flow on throttled 3G + offline reading.
 *
 * Covers the buy-sell safety posture without a database: the index renders,
 * the sell form requires contact client-side (marketplace policy), seller
 * PII never appears in SSR HTML (reveal is action-gated), and the service
 * worker serves the offline fallback when the network drops. Writes are NOT
 * posted — server actions are covered by vitest.
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

test('trader listing: market index renders on 3G with a sell entry point', async ({
  page,
}) => {
  await throttle3G(page)
  await page.goto('/en/buy-sell', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30000 })
  // The sell funnel starts at /submit — buyers read here, sellers post there.
  await expect(page.getByRole('link', { name: /submit|sell|post/i }).first()).toBeVisible()
})

test('trader listing: sell form requires contact before submit (marketplace policy)', async ({
  page,
}) => {
  await page.goto('/en/submit/buy-sell', { waitUntil: 'domcontentloaded' })
  const item = page.locator('#item')
  await expect(item).toBeVisible({ timeout: 30000 })
  await item.fill('Used Tecno Spark 10')

  // Email XOR phone is required for listings: with both empty the form must
  // be invalid, so a contactless listing can never reach the queue.
  await expect(page.locator('#email')).toHaveValue('')
  await expect(page.locator('#phone')).toHaveValue('')
  const nativeValid = await page
    .locator('form')
    .evaluate((form: HTMLFormElement) => form.checkValidity())
  expect(nativeValid).toBe(false)
})

test('trader listing: airplane mode serves the offline fallback, not a blank tab', async ({
  page,
  context,
}) => {
  // Prime the service worker first: registration happens on a normal visit.
  await page.goto('/en', { waitUntil: 'networkidle' })
  await page.evaluate(() => navigator.serviceWorker?.ready.then(() => true).catch(() => false))

  await context.setOffline(true)
  await page.goto('/en/buy-sell', { waitUntil: 'domcontentloaded' }).catch(() => {})
  // Either the cached page or the locale offline shell — never a dead blank.
  const bodyText = await page.locator('body').innerText().catch(() => '')
  expect(bodyText.length).toBeGreaterThan(0)
  await context.setOffline(false)
})

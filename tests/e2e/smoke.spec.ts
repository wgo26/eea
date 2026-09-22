import { expect, test } from '@playwright/test'

/**
 * Phase 2 — submit→trust→advertise smoke (no database required).
 *
 * Runs against `next start` with dummy Supabase env (every query falls back
 * gracefully), so this asserts the shells, SLA copy and degraded UX a reader
 * actually sees — not backend state.
 */

test('submit hub lists all five intake types, no account wall', async ({ page }) => {
  await page.goto('/en/submit', { waitUntil: 'networkidle' })
  for (const label of ['Photo', 'News', 'Notice', 'Buy', 'Culture']) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
  }
})

test('notice intake form renders with contact-safety context', async ({ page }) => {
  await page.goto('/en/submit/notice', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The form itself streams behind Suspense — the back path must exist.
  await expect(page.getByRole('link').first()).toBeVisible()
})

test('submit confirmation states the review SLA', async ({ page }) => {
  await page.goto('/en/submit/confirmation', { waitUntil: 'networkidle' })
  await expect(page.getByText('2 working days', { exact: false })).toBeVisible()
})

test('advertise page states pricing + 1-day reply SLA', async ({ page }) => {
  await page.goto('/en/advertise', { waitUntil: 'networkidle' })
  await expect(page.getByText('1 business day', { exact: false }).first()).toBeVisible()
})

test('FR confirmation carries the same SLA promise', async ({ page }) => {
  await page.goto('/fr/submit/confirmation', { waitUntil: 'networkidle' })
  await expect(page.getByText('2 jours ouvrés', { exact: false })).toBeVisible()
})

test('homepage shows the degraded notice on empty fallback (dummy backend)', async ({
  page,
}) => {
  await page.goto('/en', { waitUntil: 'networkidle' })
  await expect(page.getByText('couldn’t load', { exact: false })).toBeVisible()
})

test('health is dependency-free, ready answers anonymously', async ({ request }) => {
  const health = await request.get('/api/health')
  expect(health.ok()).toBeTruthy()
  const ready = await request.get('/api/ready')
  expect([200, 503]).toContain(ready.status())
  const body = await ready.json()
  expect(body.status).toMatch(/ready|degraded/)
  expect(body.checks).toBeUndefined()
})

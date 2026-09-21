import { defineConfig, devices } from '@playwright/test'

/**
 * Phase 3 — e2e + axe accessibility gate (was "no e2e infra" per A8).
 *
 * Local: uses the machine's Google Chrome (PLAYWRIGHT_CHANNEL=chrome) so no
 * ~170 MB browser download is needed; CI installs bundled Chromium instead.
 * The app is served via `next start` on 3100 — build first (`npm run build`
 * with the dummy Supabase env from CI; every query falls back gracefully
 * without a database, so the a11y surface is fully renderable offline).
 *
 * Run: npm run build && npm run test:e2e
 */
const useSystemChrome = process.env.PLAYWRIGHT_CHANNEL === 'chrome'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        ...(useSystemChrome ? { channel: 'chrome' as const } : {}),
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        ...(useSystemChrome ? { channel: 'chrome' as const } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100/en',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SITE_URL: 'https://preview.eagleeyeafrica.com',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
  },
})

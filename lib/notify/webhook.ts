import 'server-only'

import { logger } from '@/lib/observability/logger'

/**
 * Out-of-band paging for critical platform events (System & Infrastructure →
 * Security hardening).
 *
 * The notification centre is in-app: a chief who is asleep never sees it.
 * `DIGEST_WEBHOOK_URL` (Discord/Slack-compatible, already used by the ops
 * digest) doubles as the paging channel — point it at a channel with mobile
 * push and critical-mode activations wake a human. Unset = logged warning,
 * in-app alert still fires; paging must never break the action it reports.
 */
export async function postOpsWebhook(text: string): Promise<boolean> {
  const webhook = process.env.DIGEST_WEBHOOK_URL
  if (!webhook) {
    logger.warn('notify/webhook', 'paging skipped — DIGEST_WEBHOOK_URL not configured')
    return false
  }
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, 1900) }),
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      logger.error('notify/webhook', 'paging post failed', { status: res.status })
      return false
    }
    return true
  } catch (err) {
    logger.error('notify/webhook', 'paging post exception', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

"use server";

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth/guards';
import { assertCapability } from '@/lib/admin/auth';
import { logger } from '@/lib/observability/logger';
import { enqueueNotification } from './queue';
import { processOutbox } from './worker';
import { channelStatus } from './channels';

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' };
}

/* ------------------------------------------------------------------ */
/* User: preferences + read state (session client, RLS-owned rows)     */
/* ------------------------------------------------------------------ */

export async function saveNotificationPrefs(input: {
  inapp: boolean;
  email: boolean;
  whatsapp: boolean;
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) return { ok: false, error: 'Not authenticated.' };
    const { error } = await supabase.from('notification_prefs').upsert(
      { user_id: user.id, inapp: input.inapp, email: input.email, whatsapp: input.whatsapp, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) return { ok: false, error: 'Not authenticated.' };
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', user.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) return { ok: false, error: 'Not authenticated.' };
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/account/notifications', 'page');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ */
/* Admin: worker, test sends, retries, subscribers                      */
/* ------------------------------------------------------------------ */

export async function getChannelStatus(): Promise<{ email: boolean; whatsapp: boolean; webhook: boolean }> {
  await assertCapability('manageNotifications');
  return channelStatus();
}

/** Manually trigger the outbox worker from the admin panel. */
export async function runNotifyWorkerNow(): Promise<ActionResult & { summary?: { claimed: number; sent: number; skipped: number; failed: number } }> {
  try {
    await assertCapability('manageNotifications');
    const summary = await processOutbox();
    return { ok: true, summary };
  } catch (e) {
    return fail(e);
  }
}

/** Queue a test alert to the caller's own account (all their channels). */
export async function sendTestNotification(): Promise<ActionResult> {
  try {
    const { user } = await getSessionUser();
    if (!user) return { ok: false, error: 'Not authenticated.' };
    await assertCapability('manageNotifications');
    await enqueueNotification({
      event: 'submission.confirmation',
      audience: 'user',
      userId: user.id,
      data: { title: 'Test notification — the loop works' },
      path: '/account/notifications',
    });
    // Deliver immediately so the button feels alive (cron covers the rest).
    await processOutbox(10);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Re-queue failed rows for another delivery attempt. */
export async function retryFailedNotifications(): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('manageNotifications');
    const { error } = await supabase
      .from('notification_outbox')
      .update({ status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
      .eq('status', 'failed');
    if (error) return { ok: false, error: error.message };
    logger.info('notify-admin', 'failed rows re-queued', {});
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Toggle a digest subscriber (WhatsApp daily-brief list management). */
export async function toggleDigestSubscriber(subscriberId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('manageNotifications');
    const { error } = await supabase.from('digest_subscribers').update({ is_active: isActive }).eq('id', subscriberId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

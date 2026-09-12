"use server";

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth/guards';
import { assertCapability } from '@/lib/admin/auth';
import { logger } from '@/lib/observability/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { honeypotTripped } from '@/lib/security/honeypot';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import { enqueueNotification } from './queue';
import { processOutbox } from './worker';
import { channelStatus, normalizePhone } from './channels';

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' };
}

/* ------------------------------------------------------------------ */
/* User: preferences + read state (session client, RLS-owned rows)     */
/* ------------------------------------------------------------------ */

/**
 * Normalise a quiet-hour bound: absent → undefined (leave untouched),
 * empty → null (turn off), 0–23 integer → set. Anything else is invalid.
 */
function cleanQuietHour(v: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null || v === '') return { ok: true, value: null };
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 23) return { ok: false };
  return { ok: true, value: n };
}

export async function saveNotificationPrefs(input: {
  inapp: boolean;
  email: boolean;
  whatsapp: boolean;
  locale?: string;
  phone?: string | null;
  quietStart?: number | string | null;
  quietEnd?: number | string | null;
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await getSessionUser();
    if (!user) return { ok: false, error: 'Not authenticated.' };
    const locale = input.locale === 'fr' ? 'fr' : input.locale === 'en' ? 'en' : undefined;
    let phone: string | null | undefined;
    if (input.phone !== undefined) {
      const raw = (input.phone ?? '').trim();
      if (raw === '') phone = null;
      else {
        const digits = raw.replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Enter a valid phone number.' };
        phone = raw.slice(0, 32);
      }
    }
    const row: Record<string, unknown> = {
      user_id: user.id,
      inapp: input.inapp,
      email: input.email,
      whatsapp: input.whatsapp,
      updated_at: new Date().toISOString(),
    };
    if (locale) row.locale = locale;
    const qs = cleanQuietHour(input.quietStart);
    const qe = cleanQuietHour(input.quietEnd);
    if (!qs.ok || !qe.ok) return { ok: false, error: 'Quiet hours must be whole hours 0–23.' };
    if (qs.value !== undefined) row.quiet_start = qs.value;
    if (qe.value !== undefined) row.quiet_end = qe.value;
    const { error } = await supabase.from('notification_prefs').upsert(row, { onConflict: 'user_id' });
    if (error) return { ok: false, error: error.message };
    // Keep the worker's locale/phone fallback consistent: prefs.locale wins,
    // profiles.preferred_locale/phone is the fallback — update both together.
    const profilePatch: Record<string, string | null> = {};
    if (locale) profilePatch.preferred_locale = locale;
    if (phone !== undefined) profilePatch.phone = phone;
    if (Object.keys(profilePatch).length > 0) {
      const { error: pErr } = await supabase.from('profiles').update(profilePatch).eq('id', user.id);
      if (pErr) return { ok: false, error: pErr.message };
    }
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

export async function getChannelStatus(): Promise<{ email: boolean; whatsapp: boolean; whatsappTemplate: boolean; webhook: boolean }> {
  await assertCapability('manageNotifications');
  return channelStatus();
}

/** Manually trigger the outbox worker from the admin panel. */
export async function runNotifyWorkerNow(): Promise<ActionResult & { summary?: { claimed: number; sent: number; skipped: number; failed: number; deferred: number; pruned: number } }> {
  try {
    await assertCapability('manageNotifications');
    const summary = await processOutbox();
    return { ok: true, summary };
  } catch (e) {
    return fail(e);
  }
}

/** Queue a test alert to the caller's own account (all their channels). */
export async function sendTestNotification(): Promise<ActionResult & { summary?: { claimed: number; sent: number; skipped: number; failed: number; deferred: number; pruned: number } }> {
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
    // The per-channel summary tells the operator what actually delivered —
    // the handset check in docs/notifications.md §production.
    const summary = await processOutbox(10);
    return { ok: true, summary };
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

/** Re-queue a single outbox row for another delivery attempt. */
export async function retryOutboxRow(rowId: string): Promise<ActionResult> {
  try {
    const { supabase } = await assertCapability('manageNotifications');
    if (typeof rowId !== 'string' || rowId.trim().length === 0 || rowId.length > 64) {
      return { ok: false, error: 'Invalid row.' };
    }
    const { data, error: readError } = await supabase
      .from('notification_outbox')
      .select('id, status')
      .eq('id', rowId.trim())
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };
    if (!data) return { ok: false, error: 'Row not found.' };
    if ((data as { status: string }).status === 'pending') return { ok: true };
    const { error } = await supabase
      .from('notification_outbox')
      .update({ status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
      .eq('id', rowId.trim());
    if (error) return { ok: false, error: error.message };
    logger.info('notify-admin', 'outbox row re-queued', { rowId: rowId.trim() });
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

/* ------------------------------------------------------------------ */
/* Public: daily-digest subscribe / unsubscribe (opt-in only)          */
/* ------------------------------------------------------------------ */

function cleanEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, 160);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

function cleanLocale(v: unknown): 'en' | 'fr' {
  return v === 'fr' ? 'fr' : 'en';
}

/**
 * Public opt-in to the daily digest (`/digest`). At least one contact
 * (valid email and/or WhatsApp number) is required. Dedupe is by email
 * when an email is given (reactivate + update), otherwise a new row.
 * Rate-limited + honeypot + Turnstile-guarded like other public forms.
 */
export async function subscribeDigest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    if (honeypotTripped(formData)) return { ok: true };
    const limited = await checkRateLimit('public:digest', { max: 5, windowMs: 10 * 60_000 });
    if (!limited.ok) return { ok: false, error: 'rate_limited' };
    const token = formData.get('cf-turnstile-response');
    if (!(await verifyTurnstileToken(typeof token === 'string' ? token : null))) {
      return { ok: false, error: 'captcha' };
    }
    const email = cleanEmail(formData.get('email'));
    const whatsapp = normalizePhone(
      typeof formData.get('whatsapp') === 'string' ? (formData.get('whatsapp') as string).trim().slice(0, 32) : null,
    );
    const locale = cleanLocale(formData.get('locale'));
    if (!email && !whatsapp) return { ok: false, error: 'invalid' };

    const supabase = createAdminClient();
    if (email) {
      const { data: existing } = await supabase.from('digest_subscribers').select('id').eq('email', email).limit(1).maybeSingle();
      const row = existing as { id?: string } | null;
      if (row?.id) {
        const { error } = await supabase
          .from('digest_subscribers')
          .update({ phone: whatsapp, whatsapp, locale, is_active: true })
          .eq('id', row.id);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      }
    }
    const { error } = await supabase.from('digest_subscribers').insert({
      email,
      phone: whatsapp,
      whatsapp,
      locale,
      is_active: true,
    });
    if (error) return { ok: false, error: error.message };
    logger.info('notify-digest', 'subscriber added', { hasEmail: !!email, hasWhatsapp: !!whatsapp, locale });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Public opt-out: deactivate by email (one-off, no auth needed). */
export async function unsubscribeDigest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    if (honeypotTripped(formData)) return { ok: true };
    const limited = await checkRateLimit('public:digest-unsub', { max: 5, windowMs: 10 * 60_000 });
    if (!limited.ok) return { ok: false, error: 'rate_limited' };
    const email = cleanEmail(formData.get('email'));
    if (!email) return { ok: false, error: 'invalid' };
    const supabase = createAdminClient();
    const { error } = await supabase.from('digest_subscribers').update({ is_active: false }).eq('email', email);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

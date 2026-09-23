import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/auth/guards';
import { waMeLink } from './channels';

/**
 * Notification reads. User reads go through the session client (RLS
 * select-own policies); admin reads use the service-role client.
 */

export type UserNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  path: string | null;
  read: boolean;
  createdAt: string | null;
};

export type NotificationPrefs = {
  inapp: boolean;
  email: boolean;
  whatsapp: boolean;
  locale: string;
  /** Optional quiet window [start, end) in Africa/Douala hours; null = off. */
  quietStart: number | null;
  quietEnd: number | null;
};

export const DEFAULT_PREFS: NotificationPrefs = { inapp: true, email: true, whatsapp: false, locale: 'en', quietStart: null, quietEnd: null };

export async function getMyNotifications(limit = 50): Promise<UserNotification[]> {
  const { supabase, user } = await getSessionUser();
  if (!user) return [];
  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    type: (row.type as string) ?? 'notice',
    title: (row.title as string) ?? '',
    body: (row.body as string | null) ?? null,
    path: ((row.data as { path?: string } | null)?.path as string | undefined) ?? null,
    read: Boolean(row.read_at),
    createdAt: (row.created_at as string | null) ?? null,
  }));
}

export async function getUnreadCount(): Promise<number> {
  const { supabase, user } = await getSessionUser();
  if (!user) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);
  return count ?? 0;
}

export async function getMyPrefs(): Promise<NotificationPrefs> {
  const { supabase, user } = await getSessionUser();
  if (!user) return DEFAULT_PREFS;
  const { data } = await supabase.from('notification_prefs').select('inapp, email, whatsapp, locale, quiet_start, quiet_end').eq('user_id', user.id).maybeSingle();
  const row = data as { inapp?: boolean; email?: boolean; whatsapp?: boolean; locale?: string; quiet_start?: number | null; quiet_end?: number | null } | null;
  if (!row) return DEFAULT_PREFS;
  return {
    inapp: row.inapp ?? true,
    email: row.email ?? true,
    whatsapp: row.whatsapp ?? false,
    locale: row.locale ?? 'en',
    quietStart: row.quiet_start ?? null,
    quietEnd: row.quiet_end ?? null,
  };
}

/** Phone + account email backing the email/WhatsApp toggles (own-row RLS). */
export async function getMyContact(): Promise<{ phone: string; email: string }> {
  const { supabase, user } = await getSessionUser();
  if (!user) return { phone: '', email: '' };
  const { data } = await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle();
  const row = data as { phone?: string | null } | null;
  return { phone: row?.phone ?? '', email: user.email ?? '' };
}

export type OutboxRow = {
  id: string;
  event: string;
  audience: string;
  status: string;
  channels: string[];
  attempts: number;
  title: string | null;
  body: string | null;
  error: string | null;
  createdAt: string | null;
  sentAt: string | null;
  /** Direct recipient contact (user audience only) for manual follow-up. */
  recipientPhone: string | null;
  recipientEmail: string | null;
  /** Prefilled wa.me manual-send link (null when no phone on file). */
  waMe: string | null;
};

export async function getOutboxQueue(options?: {
  status?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: OutboxRow[]; total: number }> {
  const status = options?.status ?? 'all'
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const supabase = createAdminClient();
  let query = supabase
    .from('notification_outbox')
    .select('id, event, audience, recipient_user_id, status, channels_sent, attempts, title, body, last_error, created_at, sent_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status !== 'all') query = query.eq('status', status);
  if (search) query = query.or(`event.ilike.%${search}%,title.ilike.%${search}%,last_error.ilike.%${search}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as Record<string, unknown>[];
  // Resolve direct-recipient contacts for manual follow-up (staff rows fan
  // out at send time — no single number, so wa.me stays null there).
  const userIds = [...new Set(rows.map((r) => r.recipient_user_id as string | null).filter((v): v is string => !!v))];
  const contactById = new Map<string, { phone: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, email, phone').in('id', userIds);
    for (const p of ((profiles ?? []) as { id: string; email: string | null; phone: string | null }[])) {
      contactById.set(p.id, { phone: p.phone, email: p.email });
    }
  }
  const mapped = rows.map((row) => {
    const title = (row.title as string | null) ?? null;
    const body = (row.body as string | null) ?? null;
    const contact = typeof row.recipient_user_id === 'string' ? contactById.get(row.recipient_user_id) : undefined;
    const phone = contact?.phone ?? null;
    const text = [title ?? '', body ?? ''].filter(Boolean).join('\n');
    return {
      id: row.id as string,
      event: (row.event as string) ?? '',
      audience: (row.audience as string) ?? '',
      status: (row.status as string) ?? 'pending',
      channels: (row.channels_sent as string[] | null) ?? [],
      attempts: (row.attempts as number) ?? 0,
      title,
      body,
      error: (row.last_error as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
      sentAt: (row.sent_at as string | null) ?? null,
      recipientPhone: phone,
      recipientEmail: contact?.email ?? null,
      waMe: phone && text ? waMeLink(phone, text) : null,
    };
  });
  return { rows: mapped, total: count ?? mapped.length };
}

export async function getOutboxStats(): Promise<{ pending: number; sent24h: number; failed: number }> {
  const supabase = createAdminClient();
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [pending, sent, failed] = await Promise.all([
    supabase.from('notification_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('notification_outbox').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', dayAgo),
    supabase.from('notification_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  return { pending: pending.count ?? 0, sent24h: sent.count ?? 0, failed: failed.count ?? 0 };
}

export type DigestSubscriber = {
  id: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  locale: string | null;
  diasporaMode: boolean;
  /** W18 (H6) — subscribe-form pitch variant attribution. */
  pitchVariant: 'standard' | 'diaspora';
  isActive: boolean;
};

export async function getDigestSubscribers(limit = 100): Promise<DigestSubscriber[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('digest_subscribers')
    .select('id, email, phone, whatsapp, locale, diaspora_mode, pitch_variant, is_active')
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    diasporaMode: Boolean(row.diaspora_mode),
    pitchVariant: row.pitch_variant === 'diaspora' ? 'diaspora' : 'standard',
    isActive: Boolean(row.is_active),
  }));
}

/**
 * W18 (H6) experiment readout — signups per pitch variant over the trailing
 * window. Client-side bucketing keeps the subscriber table small, so the
 * bucketing happens in code, not SQL.
 */
export async function getDigestPitchStats(days = 30): Promise<{ standard: number; diaspora: number; since: string }> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from('digest_subscribers')
    .select('pitch_variant')
    .gte('created_at', since)
    .limit(5000);
  let standard = 0;
  let diaspora = 0;
  for (const row of ((data ?? []) as { pitch_variant: string | null }[])) {
    if (row.pitch_variant === 'diaspora') diaspora += 1;
    else standard += 1;
  }
  return { standard, diaspora, since };
}

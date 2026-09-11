import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/auth/guards';

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
};

export const DEFAULT_PREFS: NotificationPrefs = { inapp: true, email: true, whatsapp: false, locale: 'en' };

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
  const { data } = await supabase.from('notification_prefs').select('inapp, email, whatsapp, locale').eq('user_id', user.id).maybeSingle();
  const row = data as { inapp?: boolean; email?: boolean; whatsapp?: boolean; locale?: string } | null;
  if (!row) return DEFAULT_PREFS;
  return {
    inapp: row.inapp ?? true,
    email: row.email ?? true,
    whatsapp: row.whatsapp ?? false,
    locale: row.locale ?? 'en',
  };
}

export type OutboxRow = {
  id: string;
  event: string;
  audience: string;
  status: string;
  channels: string[];
  attempts: number;
  title: string | null;
  error: string | null;
  createdAt: string | null;
  sentAt: string | null;
};

export async function getOutboxQueue(limit = 50): Promise<OutboxRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('notification_outbox')
    .select('id, event, audience, status, channels_sent, attempts, title, last_error, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    event: (row.event as string) ?? '',
    audience: (row.audience as string) ?? '',
    status: (row.status as string) ?? 'pending',
    channels: (row.channels_sent as string[] | null) ?? [],
    attempts: (row.attempts as number) ?? 0,
    title: (row.title as string | null) ?? null,
    error: (row.last_error as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
  }));
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
  isActive: boolean;
};

export async function getDigestSubscribers(limit = 100): Promise<DigestSubscriber[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('digest_subscribers')
    .select('id, email, phone, whatsapp, locale, is_active')
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    locale: (row.locale as string | null) ?? null,
    isActive: Boolean(row.is_active),
  }));
}

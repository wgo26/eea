import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { sendEmail, sendWhatsApp } from "./channels";
import { SITE } from "@/lib/constants";

/**
 * Outbox worker: claims due rows, resolves recipients (staff roster + prefs
 * at send time), delivers in-app/email/WhatsApp, then marks sent/failed with
 * capped retries. Called by `/api/cron/notify` (every 15 min) and manually
 * from the admin test panel.
 */

const BATCH = 50;
const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: string;
  audience: string;
  recipient_user_id: string | null;
  event: string;
  locale: string;
  title: string | null;
  title_fr: string | null;
  body: string | null;
  body_fr: string | null;
  data: Record<string, string | number | null> | null;
  attempts: number;
};

type Recipient = {
  userId: string;
  email: string | null;
  phone: string | null;
  locale: string;
  inapp: boolean;
  emailOpt: boolean;
  whatsappOpt: boolean;
};

function pickLocale(locale: string | null | undefined): 'en' | 'fr' {
  return /^fr/i.test(locale ?? '') ? 'fr' : 'en';
}

function localized(row: OutboxRow, locale: 'en' | 'fr'): { title: string; body: string } {
  return {
    title: (locale === 'fr' ? row.title_fr : row.title) ?? row.title ?? row.title_fr ?? row.event,
    body: (locale === 'fr' ? row.body_fr : row.body) ?? row.body ?? row.body_fr ?? '',
  };
}

async function loadRecipients(userIds: string[]): Promise<Map<string, Recipient>> {
  const supabase = createAdminClient();
  const out = new Map<string, Recipient>();
  if (userIds.length === 0) return out;
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    supabase.from('profiles').select('id, email, phone, preferred_locale').in('id', userIds),
    supabase.from('notification_prefs').select('user_id, inapp, email, whatsapp, locale').in('user_id', userIds),
  ]);
  const prefById = new Map((prefs ?? []).map((p) => [p.user_id as string, p]));
  for (const p of (profiles ?? []) as { id: string; email: string | null; phone: string | null; preferred_locale: string | null }[]) {
    const pref = prefById.get(p.id) as { inapp?: boolean; email?: boolean; whatsapp?: boolean; locale?: string } | undefined;
    out.set(p.id, {
      userId: p.id,
      email: p.email,
      phone: p.phone,
      locale: (pref?.locale as string | undefined) ?? p.preferred_locale ?? 'en',
      inapp: pref?.inapp ?? true,
      emailOpt: pref?.email ?? true,
      whatsappOpt: pref?.whatsapp ?? false,
    });
  }
  return out;
}

async function staffUserIds(): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'editor']);
  if (error) {
    logger.error('notify', 'staff roster failed', { error: error.message });
    return [];
  }
  return [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
}

function backoff(attempts: number): string {
  const minutes = Math.min(Math.pow(2, attempts) * 5, 360);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export type WorkerSummary = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
};

export async function processOutbox(limit = BATCH): Promise<WorkerSummary> {
  const supabase = createAdminClient();
  const summary: WorkerSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0 };

  const { data: rows, error } = await supabase
    .from('notification_outbox')
    .select('id, audience, recipient_user_id, event, locale, title, title_fr, body, body_fr, data, attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error('notify', 'claim failed', { error: error.message });
    return summary;
  }
  const due = (rows ?? []) as OutboxRow[];
  summary.claimed = due.length;
  if (due.length === 0) return summary;

  for (const row of due) {
    try {
      // Resolve recipients.
      const userIds =
        row.audience === 'staff' ? await staffUserIds() : row.recipient_user_id ? [row.recipient_user_id] : [];
      if (userIds.length === 0) {
        await supabase.from('notification_outbox').update({ status: 'skipped', last_error: 'no recipients' }).eq('id', row.id);
        summary.skipped += 1;
        continue;
      }
      const recipients = await loadRecipients(userIds);
      const data = row.data ?? {};
      const rawPath = typeof data.path === 'string' ? data.path : '/account/notifications';
      const sentChannels = new Set<string>();

      for (const r of recipients.values()) {
        const locale = pickLocale(r.locale);
        const { title, body } = localized(row, locale);
        const path = `/${locale}${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`;
        const url = `${SITE.url}${path}`;

        if (r.inapp) {
          const { error: inErr } = await supabase.from('notifications').insert({
            user_id: r.userId,
            type: row.event,
            title,
            body: body ? `${body}\n\n${url}` : url,
            data: { ...data, path: rawPath },
          });
          if (!inErr) sentChannels.add('inapp');
          else logger.error('notify', 'inapp insert failed', { error: inErr.message, event: row.event });
        }
        if (r.emailOpt && r.email) {
          const res = await sendEmail(r.email, title, title, body, url);
          if (res.delivered) sentChannels.add('email');
          else if (res.error) logger.error('notify', 'email failed', { error: res.error, event: row.event });
        }
        if (r.whatsappOpt && r.phone) {
          const text = `${title}\n${body}${url ? `\n${url}` : ''}`;
          const res = await sendWhatsApp(r.phone, text);
          if (res.delivered) sentChannels.add('whatsapp');
          else if (res.error) logger.error('notify', 'whatsapp failed', { error: res.error, event: row.event });
        }
      }

      if (sentChannels.size > 0) {
        await supabase
          .from('notification_outbox')
          .update({ status: 'sent', sent_at: new Date().toISOString(), channels_sent: [...sentChannels], last_error: null })
          .eq('id', row.id);
        summary.sent += 1;
      } else if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await supabase
          .from('notification_outbox')
          .update({ status: 'failed', last_error: 'no channel delivered after retries' })
          .eq('id', row.id);
        summary.failed += 1;
      } else {
        await supabase
          .from('notification_outbox')
          .update({ attempts: row.attempts + 1, next_attempt_at: backoff(row.attempts + 1), last_error: 'no channel delivered yet' })
          .eq('id', row.id);
        summary.skipped += 1;
      }
    } catch (err) {
      logger.error('notify', 'row exception', { error: err instanceof Error ? err.message : String(err), id: row.id });
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await supabase.from('notification_outbox').update({ status: 'failed', last_error: 'worker exception' }).eq('id', row.id);
        summary.failed += 1;
      } else {
        await supabase
          .from('notification_outbox')
          .update({ attempts: row.attempts + 1, next_attempt_at: backoff(row.attempts + 1), last_error: 'worker exception' })
          .eq('id', row.id);
        summary.skipped += 1;
      }
    }
  }
  return summary;
}

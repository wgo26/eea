import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { defaultStaffPath, renderEvent, type NotifyPayload } from "./events";
/**
 * Enqueue side of the notification loop. Called from public intake actions
 * and moderation actions AFTER the primary write succeeds — a queue failure
 * must never fail the user's submission (best-effort, logged).
 */

export async function enqueueNotification(payload: NotifyPayload): Promise<void> {
  try {
    if (payload.audience === 'user' && !payload.userId) return;
    const rendered = renderEvent(payload);
    const supabase = createAdminClient();
    const path = payload.path ?? (payload.audience === 'staff' ? defaultStaffPath(payload.event) : '/account/notifications');
    const { error } = await supabase.from('notification_outbox').insert({
      audience: payload.audience,
      recipient_user_id: payload.audience === 'user' ? (payload.userId as string) : null,
      event: payload.event,
      title: rendered.title,
      title_fr: rendered.titleFr,
      body: rendered.body,
      body_fr: rendered.bodyFr,
      data: { ...(payload.data ?? {}), path },
    });
    if (error) logger.error('notify', 'enqueue failed', { error: error.message, event: payload.event });
  } catch (err) {
    logger.error('notify', 'enqueue exception', { error: err instanceof Error ? err.message : String(err), event: payload.event });
  }
}

/** Staff alert shorthand (moderation queue, ad inquiries, legal inbox). */
export function enqueueStaffAlert(
  event: Extract<NotifyPayload['event'], 'submission.received' | 'advertise.inquiry' | 'legal.takedown' | 'legal.contact' | 'legal.data_request' | 'content.correction'>,
  data?: Record<string, string | number | null>,
  path?: string,
): Promise<void> {
  return enqueueNotification({ event, audience: 'staff', data, path });
}

/** Direct user nudge (receipts, publish decisions, campaign live). No-op without a user id. */
export function enqueueUser(
  event: Extract<NotifyPayload['event'], 'submission.confirmation' | 'submission.approved' | 'submission.rejected' | 'submission.clarification' | 'advertise.approved' | 'listing.update'>,
  userId: string | null | undefined,
  data?: Record<string, string | number | null>,
  path?: string,
): Promise<void> {
  if (!userId) return Promise.resolve();
  return enqueueNotification({ event, audience: 'user', userId, data, path });
}

type SupabaseLike = ReturnType<typeof createAdminClient>;

/** Load who to notify + the human title for a submission decision. */
export async function submissionNotifyTarget(
  supabase: SupabaseLike,
  submissionId: string,
): Promise<{ userId: string | null; title: string }> {
  try {
    const { data } = await supabase
      .from('submissions')
      .select('submitted_by, submission_type, payload')
      .eq('id', submissionId)
      .maybeSingle();
    const row = data as { submitted_by?: string | null; submission_type?: string; payload?: Record<string, string> | null } | null;
    const payload = row?.payload ?? {};
    const title =
      payload.headline || payload.item || payload.what || payload.message || row?.submission_type || 'your submission';
    return { userId: row?.submitted_by ?? null, title: title.slice(0, 140) };
  } catch {
    return { userId: null, title: 'your submission' };
  }
}

/** Load the owner + title for a listing lifecycle event (sold/expired/removed/relisted). */
export async function listingNotifyTarget(
  supabase: SupabaseLike,
  contentItemId: string,
): Promise<{ userId: string | null; title: string }> {
  try {
    const { data } = await supabase
      .from('content_items')
      .select('submitted_by, author_id, translations:content_translations(title)')
      .eq('id', contentItemId)
      .maybeSingle();
    const row = data as {
      submitted_by?: string | null;
      author_id?: string | null;
      translations?: { title?: string | null } | { title?: string | null }[] | null;
    } | null;
    const tr = Array.isArray(row?.translations) ? row.translations[0] : row?.translations;
    return {
      userId: row?.submitted_by ?? row?.author_id ?? null,
      title: (tr?.title ?? 'your listing').slice(0, 140),
    };
  } catch {
    return { userId: null, title: 'your listing' };
  }
}

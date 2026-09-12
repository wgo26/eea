'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Megaphone, MessageCircle, Play, RotateCcw } from 'lucide-react';
import { retryFailedNotifications, retryOutboxRow, runNotifyWorkerNow, sendTestNotification, toggleDigestSubscriber } from '@/lib/notify/actions';
import { useAdminMutation } from '@/components/admin/confirm-dialog';
import { useToast } from '@/components/admin/toast';
import type { Dictionary } from '@/lib/i18n';
import type { OutboxRow } from '@/lib/notify/queries';

type Copy = Dictionary['admin']['notifications'];

type Summary = { claimed: number; sent: number; skipped: number; failed: number; deferred: number; pruned: number };

function formatSummary(copy: Copy, s: Summary): string {
  return copy.testSummary
    .replace('{sent}', String(s.sent))
    .replace('{skipped}', String(s.skipped))
    .replace('{failed}', String(s.failed));
}

/** Queue action bar: test send, manual worker run, retry failures. */
export function NotificationQueueActions({ copy }: { copy: Copy }) {
  const { run, loading } = useAdminMutation();
  const { addToast } = useToast();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function after(promise: Promise<{ ok: true } | { ok: false; error: string }>, message: string) {
    const res = await run(() => promise, message);
    if (res) {
      setNote(message);
      router.refresh();
      setTimeout(() => setNote(null), 3000);
    }
  }

  // Summary actions call the server action directly: useAdminMutation's run()
  // only returns a boolean, and we need the per-channel summary for the note.
  async function afterSummary(action: () => Promise<{ ok: boolean; error?: string; summary?: Summary }>, message: string) {
    setBusy(true);
    try {
      const res = await action();
      if (res.ok) {
        const detail = res.summary ? ` — ${formatSummary(copy, res.summary)}` : '';
        setNote(`${message}${detail}`);
        addToast(`${message}${detail}`, 'success');
        router.refresh();
        setTimeout(() => setNote(null), 5000);
      } else {
        addToast(res.error || 'Operation failed', 'error');
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => afterSummary(() => sendTestNotification(), copy.testSent)}
        disabled={loading || busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Megaphone className="h-3.5 w-3.5" aria-hidden />
        {copy.testButton}
      </button>
      <button
        type="button"
        onClick={() => afterSummary(() => runNotifyWorkerNow(), copy.workerRan)}
        disabled={loading || busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        {copy.runWorker}
      </button>
      <button
        type="button"
        onClick={() => after(retryFailedNotifications(), copy.retried)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {copy.retryFailed}
      </button>
      {note ? <span className="text-xs font-medium text-emerald-600">{note}</span> : null}
    </div>
  );
}

/**
 * Per-row queue actions: retry a failed/skipped row, open a prefilled wa.me
 * manual-send link when the recipient has a phone, or copy the alert text
 * for staff rows (which fan out — no single number to link).
 */
export function OutboxRowActions({ row, copy }: { row: OutboxRow; copy: Copy }) {
  const { run, loading } = useAdminMutation();
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);

  async function handleRetry() {
    const ok = await run(() => retryOutboxRow(row.id), '');
    if (ok) {
      setDone(copy.retriedOne);
      router.refresh();
      setTimeout(() => setDone(null), 2500);
    }
  }

  async function handleCopy() {
    const text = [row.title ?? '', row.body ?? ''].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setDone(copy.copied);
      setTimeout(() => setDone(null), 2000);
    } catch {
      setDone(null);
    }
  }

  const retryable = row.status === 'failed' || row.status === 'skipped';

  return (
    <span className="inline-flex items-center gap-1.5">
      {retryable ? (
        <button
          type="button"
          onClick={handleRetry}
          disabled={loading}
          title={copy.retryOne}
          aria-label={copy.retryOne}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          {copy.retryOne}
        </button>
      ) : null}
      {row.waMe ? (
        <a
          href={row.waMe}
          target="_blank"
          rel="noopener noreferrer"
          title={copy.openWaMe}
          aria-label={copy.openWaMe}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <MessageCircle className="h-3 w-3" aria-hidden />
          wa.me
        </a>
      ) : (
        <button
          type="button"
          onClick={handleCopy}
          title={copy.copyText}
          aria-label={copy.copyText}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          {done === copy.copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copy.copyText}
        </button>
      )}
      {done ? <span className="text-[11px] font-medium text-emerald-600">{done}</span> : null}
    </span>
  );
}

/** Digest-subscriber active toggle (WhatsApp daily-brief list). */
export function SubscriberToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const { run, loading } = useAdminMutation();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        const ok = await run(() => toggleDigestSubscriber(id, !isActive), '');
        if (ok) router.refresh();
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
      role="switch"
      aria-checked={isActive}
      aria-label="active"
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

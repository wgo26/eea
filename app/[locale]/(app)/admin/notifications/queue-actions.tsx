'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Megaphone, Play, RotateCcw } from 'lucide-react';
import { retryFailedNotifications, runNotifyWorkerNow, sendTestNotification, toggleDigestSubscriber } from '@/lib/notify/actions';
import { useAdminMutation } from '@/components/admin/confirm-dialog';
import type { Dictionary } from '@/lib/i18n';

type Copy = Dictionary['admin']['notifications'];

/** Queue action bar: test send, manual worker run, retry failures. */
export function NotificationQueueActions({ copy }: { copy: Copy }) {
  const { run, loading } = useAdminMutation();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  async function after(promise: Promise<{ ok: true } | { ok: false; error: string }>, message: string) {
    const res = await run(() => promise, message);
    if (res) {
      setNote(message);
      router.refresh();
      setTimeout(() => setNote(null), 3000);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => after(sendTestNotification(), copy.testSent)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Megaphone className="h-3.5 w-3.5" aria-hidden />
        {copy.testButton}
      </button>
      <button
        type="button"
        onClick={() => after(runNotifyWorkerNow(), copy.workerRan)}
        disabled={loading}
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

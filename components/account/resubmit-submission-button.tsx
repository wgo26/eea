'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { resubmitOwnSubmission } from '@/lib/account/listings-actions';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import type { Dictionary } from '@/lib/i18n';

/** Phase 3 — one-tap resubmit for rejected/withdrawn submissions (owner only). */
export function ResubmitSubmissionButton({ submissionId, dict }: { submissionId: string; dict: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleResubmit() {
    setBusy(true);
    const result = await resubmitOwnSubmission(submissionId);
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setDone(true);
    }
  }

  if (done) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        {dict.submit.resubmit}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={dict.submit.resubmit}
        description={dict.submit.resubmitConfirm}
        confirmLabel={dict.submit.resubmit}
        cancelLabel={dict.common.back}
        onConfirm={handleResubmit}
        loading={busy}
      />
    </>
  );
}

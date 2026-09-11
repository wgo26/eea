'use client';

import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { withdrawOwnSubmission } from '@/lib/account/listings-actions';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import type { Dictionary } from '@/lib/i18n';

/** Withdraw button for a pending/in-review submission (owner only). */
export function WithdrawSubmissionButton({ submissionId, dict }: { submissionId: string; dict: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  async function handleWithdraw() {
    setBusy(true);
    const result = await withdrawOwnSubmission(submissionId);
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setGone(true);
    }
  }

  if (gone) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Undo2 className="h-3 w-3" aria-hidden />
        {dict.submit.withdraw}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={dict.submit.withdraw}
        description={dict.submit.withdrawConfirm}
        confirmLabel={dict.submit.withdraw}
        cancelLabel={dict.common.back}
        onConfirm={handleWithdraw}
        loading={busy}
      />
    </>
  );
}

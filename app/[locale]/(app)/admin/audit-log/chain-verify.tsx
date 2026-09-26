'use client'

import { useState } from 'react'
import { verifyAuditChain } from '@/lib/admin/actions/audit'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['audit']

/**
 * On-demand chain verification for the audit page: replays the hash chain
 * from genesis (bounded per click; the monthly archive cron covers the full
 * history). A break means rows were modified or deleted outside the app —
 * investigate before trusting recent entries.
 */
export function ChainVerifyButton({ copy }: { copy: Copy }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function verify() {
    setBusy(true)
    setMessage(null)
    const result = await verifyAuditChain()
    setBusy(false)
    if (result.ok) {
      setMessage(copy.chainIntact.replace('{count}', String(result.checked)))
      setIsError(false)
    } else {
      setMessage(result.error)
      setIsError(true)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message && (
        <span className={`text-xs ${isError ? 'text-destructive' : 'text-emerald-600'}`}>{message}</span>
      )}
      <button
        type="button"
        onClick={verify}
        disabled={busy}
        className="inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
      >
        {busy ? copy.verifying : copy.verifyChain}
      </button>
    </div>
  )
}

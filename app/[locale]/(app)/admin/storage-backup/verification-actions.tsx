'use client'

import { useState } from 'react'
import { queueStorageVerification } from '@/lib/admin/actions/storage'
import type { Dictionary } from '@/lib/i18n'

export function VerificationActions({ copy }: { copy: Dictionary['admin']['storage'] }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  async function queue() {
    setBusy(true)
    const result = await queueStorageVerification()
    setBusy(false)
    if (result.ok) {
      const count = (result as { count?: number }).count ?? 0
      setMessage(`${copy.verificationQueued} (${count})`)
      setIsError(false)
    } else {
      setMessage(result.error)
      setIsError(true)
    }
  }
  return <div className="flex items-center gap-2"><span className={`text-xs ${isError ? 'text-destructive' : 'text-emerald-600'}`}>{message}</span><button type="button" onClick={queue} disabled={busy} className="inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors">{busy ? copy.queuing : copy.verifyFiles}</button></div>
}
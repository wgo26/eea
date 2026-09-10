'use client'

import { useState } from 'react'
import { triggerBackup } from '@/lib/admin/actions'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['storage']

export function BackupActions({ copy }: { copy: Copy }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleBackup() {
    setBusy(true)
    setMessage(null)
    const result = await triggerBackup()
    setBusy(false)
    if (result.ok) {
      const count = (result as { count?: number }).count ?? 0
      setMessage(`${copy.backupQueued} (${count})`)
    } else {
      setMessage(result.error)
    }
  }

  const isSuccess = message != null && message.startsWith(copy.backupQueued)

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs ${isSuccess ? 'text-emerald-600' : 'text-destructive'}`}>
          {message}
        </span>
      )}
      <button
        onClick={handleBackup}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {busy ? copy.queuing : copy.triggerBackup}
      </button>
    </div>
  )
}

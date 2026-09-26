'use client'

import { useState } from 'react'
import { purgeCompletedTasks, retryFailedTasks, runRestoreDrill, scanStorageOrphans } from '@/lib/admin/actions/storage'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['storage']

/** Task-queue operations: retry what failed, purge what is long done. */
export function TaskActions({ copy, failedCount }: { copy: Copy; failedCount: number }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function runAction(kind: 'retry' | 'purge' | 'drill' | 'orphans') {
    setBusy(true)
    setMessage(null)
    if (kind === 'drill') {
      const result = await runRestoreDrill()
      setBusy(false)
      if (result.ok) {
        const fails = result.failures.length > 0 ? ` — ${result.failures.slice(0, 2).join('; ')}` : ''
        setMessage(`${copy.drillResult.replace('{passed}', String(result.passed)).replace('{checked}', String(result.checked))}${fails}`)
        setIsError(result.failed > 0)
      } else {
        setMessage(result.error)
        setIsError(true)
      }
      return
    }
    if (kind === 'orphans') {
      const result = await scanStorageOrphans()
      setBusy(false)
      if (result.ok) {
        setMessage(copy.orphanResult.replace('{count}', String(result.orphanCount)).replace('{total}', String(result.totalKeys)))
        setIsError(result.orphanCount > 0)
      } else {
        setMessage(result.error)
        setIsError(true)
      }
      return
    }
    const result =
      kind === 'retry' ? await retryFailedTasks() : await purgeCompletedTasks()
    setBusy(false)
    if (result.ok) {
      const count = (result as { count?: number }).count ?? 0
      setMessage(`${kind === 'retry' ? copy.tasksRetried : copy.tasksPurged} (${count})`)
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
        onClick={() => runAction('retry')}
        disabled={busy || failedCount === 0}
        className="inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
      >
        {copy.retryFailed}
      </button>
      <button
        type="button"
        onClick={() => runAction('purge')}
        disabled={busy}
        className="inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
      >
        {copy.purgeCompleted}
      </button>
      <button
        type="button"
        onClick={() => runAction('drill')}
        disabled={busy}
        className="inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
      >
        {copy.restoreDrill}
      </button>
      <button
        type="button"
        onClick={() => runAction('orphans')}
        disabled={busy}
        className="inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium disabled:opacity-50 hover:bg-accent transition-colors"
      >
        {copy.orphanScan}
      </button>
    </div>
  )
}

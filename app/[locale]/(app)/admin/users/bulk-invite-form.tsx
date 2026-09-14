'use client'

import { useState } from 'react'
import { bulkInviteUsers } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['users']

/**
 * Bulk invite from pasted CSV lines (`email, role`). Invalid lines are
 * skipped and reported per line; lines granting `admin` trigger the
 * step-up password prompt first.
 */
export function BulkInviteForm({ copy, common }: { copy: Copy; common: Dictionary['admin']['common'] }) {
  const { addToast } = useToast()
  const [text, setText] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ sent: number; skipped: { line: string; reason: string }[] } | null>(null)

  const needsPassword = text
    .split('\n')
    .map((l) => l.split(',')[1]?.trim().toLowerCase())
    .includes('admin')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setLoading(true)
    setResult(null)
    const res = await bulkInviteUsers(lines, needsPassword ? password || undefined : undefined)
    setLoading(false)
    if (!res.ok) {
      addToast(res.error, 'error')
      return
    }
    setResult({ sent: res.sent, skipped: res.skipped })
    addToast(
      copy.csvResult.replace('{sent}', String(res.sent)).replace(
        '{skipped}',
        res.skipped.length > 0
          ? copy.csvSkipped
              .replace('{count}', String(res.skipped.length))
              .replace('{lines}', res.skipped.map((s) => s.line).join('; '))
          : '',
      ),
      res.skipped.length > 0 ? 'info' : 'success',
    )
    if (res.skipped.length === 0) {
      setText('')
      setPassword('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{copy.csvTitle}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{copy.csvBody}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={copy.csvPlaceholder}
        aria-label={copy.csvTitle}
        className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {needsPassword ? (
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={copy.reauthPasswordLabel}
          aria-label={copy.reauthPasswordLabel}
          autoComplete="current-password"
          className="mt-2 w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !text.trim() || (needsPassword && !password)}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? common.working : copy.csvUpload}
        </button>
        {result ? (
          <span className="text-xs text-muted-foreground">
            {copy.csvResult.replace('{sent}', String(result.sent)).replace('{skipped}', '')}
          </span>
        ) : null}
      </div>
      {result && result.skipped.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          {result.skipped.map((s) => (
            <li key={s.line}>
              <span className="font-mono">{s.line}</span> — {s.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}

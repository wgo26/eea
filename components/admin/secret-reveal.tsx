'use client'

import { useState } from 'react'
import { ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['secrets']

/**
 * The one-time secret panel (spec §13). Deliberately renders the plaintext into
 * a read-only `<textarea>` rather than a link or a query parameter — the value
 * must never arrive over a URL (spec §16) and copying is the only supported
 * action. Warn before unload-able navigation: closing the panel clears the
 * value from component state, and the server cannot hand it out again.
 */
export function SecretReveal({
  secret,
  version,
  generated,
  copy,
  onDone,
}: {
  secret: string
  version: number
  generated: boolean
  copy: Copy
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function download() {
    // A Blob URL keeps the value out of the URL bar and out of history.
    const blob = new Blob([secret], { type: 'text/plain' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `credential-v${version}.txt`
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-amber-900">{copy.revealHeading}</h2>
        <span className="font-mono text-xs text-amber-800">v{version}</span>
      </div>
      <p className="mt-1 text-xs text-amber-900/80">{copy.revealBody}</p>

      <textarea
        readOnly
        value={secret}
        rows={2}
        spellCheck={false}
        autoComplete="off"
        aria-label={copy.secretLabel}
        className={`mt-3 font-mono ${ui.textarea} bg-white`}
        onFocus={(e) => e.currentTarget.select()}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={ui.btnPrimary} onClick={copyValue}>
          {copied ? copy.copied : copy.copy}
        </button>
        <button type="button" className={ui.btnSecondary} onClick={download}>
          {copy.revealDownload}
        </button>
        {generated && <span className="text-xs text-amber-900/70">{copy.generateHint}</span>}
        <button type="button" className={`ml-auto ${ui.btnGhost}`} onClick={onDone}>
          {copy.revealDone}
        </button>
      </div>
    </section>
  )
}

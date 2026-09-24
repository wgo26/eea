'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCredential } from '@/lib/admin/actions/credentials'
import type { CredentialCategory } from '@/lib/security/credential-manager'
import { SecretReveal } from '@/components/admin/secret-reveal'
import { Field, ui } from '@/lib/admin/ui-constants'
import { useToast } from '@/components/admin/toast'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['secrets']

/** base64url of 32 random bytes — the same shape the server generator emits. */
function browserSecret(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  let binary = ''
  arr.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function CredentialCreateForm({
  copy,
  categories,
  common,
}: {
  copy: Copy
  categories: readonly CredentialCategory[]
  common: Dictionary['admin']['common']
}) {
  const locale = useLocaleFromPath()
  const router = useRouter()
  const { addToast } = useToast()

  const [name, setName] = useState('')
  const [provider, setProvider] = useState('')
  const [category, setCategory] = useState<CredentialCategory | ''>('')
  const [secretValue, setSecretValue] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [rotationDays, setRotationDays] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<{ id: string; secret: string; version: number; generated: boolean } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return addToast(copy.nameRequired, 'error')
    if (!provider.trim()) return addToast(copy.providerRequired, 'error')
    if (!secretValue.trim()) return addToast(copy.secretRequired, 'error')

    setSaving(true)
    try {
      const result = await createCredential({
        name,
        provider,
        category: category || null,
        secretValue,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        rotationPolicy: rotationDays ? { intervalDays: Number.parseInt(rotationDays, 10) || null } : null,
        notes,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastCreated, 'success')
      setRevealed({ id: result.id, secret: result.secret, version: result.version, generated: result.generated })
      setSecretValue('')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (revealed) {
    return (
      <div className="space-y-4">
        <SecretReveal
          secret={revealed.secret}
          version={revealed.version}
          generated={revealed.generated}
          copy={copy}
          onDone={() => router.push(localePath(locale, `/admin/secrets/${revealed.id}`))}
        />
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className={ui.hint}>{copy.createHint}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.nameLabel}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={copy.namePlaceholder}
            className={ui.input}
            autoComplete="off"
          />
        </Field>
        <Field label={copy.providerLabel} hint={copy.providerHint}>
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value.toLowerCase())}
            placeholder={copy.providerPlaceholder}
            className={ui.input}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label={copy.categoryLabel}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CredentialCategory | '')}
          className={ui.select}
        >
          <option value="">{copy.categoryNone}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {copy.categories[c]}
            </option>
          ))}
        </select>
      </Field>

      <Field label={copy.secretLabel} hint={copy.secretHint}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            placeholder={copy.secretPlaceholder}
            className={`font-mono ${ui.input}`}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className={`${ui.btnSecondary} whitespace-nowrap`}
            onClick={() => setSecretValue(browserSecret())}
            title={copy.generateHint}
          >
            {copy.generate}
          </button>
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.expiresLabel} hint={copy.expiresHint}>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={ui.input}
          />
        </Field>
        <Field label={copy.rotationIntervalLabel} hint={copy.rotationHint}>
          <input
            type="number"
            min={1}
            value={rotationDays}
            onChange={(e) => setRotationDays(e.target.value)}
            placeholder={copy.rotationIntervalPlaceholder}
            className={ui.input}
          />
        </Field>
      </div>

      <Field label={copy.notesLabel}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={copy.notesPlaceholder}
          rows={2}
          className={ui.textarea}
        />
      </Field>

      <div className="flex justify-end">
        <button type="submit" className={ui.btnPrimary} disabled={saving}>
          {saving ? common.working : copy.submit}
        </button>
      </div>
    </form>
  )
}

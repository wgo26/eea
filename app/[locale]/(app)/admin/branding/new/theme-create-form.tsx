'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createThemeDraft } from '@/lib/admin/actions/themes'
import { Field, ui } from '@/lib/admin/ui-constants'
import { useToast } from '@/components/admin/toast'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['branding']

export type ThemeOption = { id: string; name: string; version: string }

export function ThemeCreateForm({
  copy,
  common,
  themes,
}: {
  copy: Copy
  common: Dictionary['admin']['common']
  themes: ThemeOption[]
}) {
  const locale = useLocaleFromPath()
  const router = useRouter()
  const { addToast } = useToast()

  const [name, setName] = useState('')
  const [fromThemeId, setFromThemeId] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return addToast(copy.nameRequired, 'error')

    setSaving(true)
    try {
      const result = await createThemeDraft({
        name,
        fromThemeId: fromThemeId || undefined,
        changeSummary: changeSummary || undefined,
      })
      if (!result.ok) {
        addToast(result.error, 'error')
        return
      }
      addToast(copy.toastCreated, 'success')
      router.push(localePath(locale, `/admin/branding/${result.id}`))
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className={ui.hint}>{copy.createHint}</p>

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

      <Field label={copy.startFromLabel}>
        <select
          value={fromThemeId}
          onChange={(e) => setFromThemeId(e.target.value)}
          className={ui.select}
        >
          <option value="">{copy.startFromDefault}</option>
          {themes.length > 0 && (
            <optgroup label={copy.startFromTheme}>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name} v{theme.version}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>

      <Field label={copy.changeSummaryLabel}>
        <textarea
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder={copy.changeSummaryPlaceholder}
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

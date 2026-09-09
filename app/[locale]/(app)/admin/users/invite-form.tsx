'use client'

import { useState } from 'react'
import { inviteUser } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { AppRole } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['users']

const INVITABLE_ROLES: AppRole[] = ['admin', 'editor', 'contributor', 'advertiser']

/** Invite-by-email form: the orphaned `inviteUser` action finally has a UI. */
export function InviteForm({ copy, common }: { copy: Copy; common: Dictionary['admin']['common'] }) {
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('contributor')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await inviteUser(email.trim(), role)
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastInvited, 'success')
      setEmail('')
      setOpen(false)
    } else {
      addToast(result.error, 'error')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {copy.inviteTitle}
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-medium">{copy.inviteTitle}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{copy.inviteBody}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.inviteEmailLabel}</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.inviteRoleLabel}</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {copy[r === 'admin' ? 'roleAdmin' : r === 'editor' ? 'roleEditor' : r === 'contributor' ? 'roleContributor' : 'roleAdvertiser']}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? common.working : copy.inviteSubmit}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            {common.cancel}
          </button>
        </div>
      </div>
    </form>
  )
}

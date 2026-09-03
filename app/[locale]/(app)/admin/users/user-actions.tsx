'use client'

import { useState } from 'react'
import { setUserRole } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { AppRole, UserRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['users']

const ALL_ROLES: AppRole[] = ['admin', 'editor', 'contributor', 'advertiser']

const ROLE_LABEL_KEY: Record<AppRole, keyof Copy> = {
  admin: 'roleAdmin',
  editor: 'roleEditor',
  contributor: 'roleContributor',
  advertiser: 'roleAdvertiser',
}

export function UserActions({ user, copy }: { user: UserRow; copy: Copy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleToggleRole(role: AppRole) {
    setLoading(true)
    const hasRole = user.roles.includes(role)
    const result = await setUserRole(user.id, role, !hasRole)
    setLoading(false)
    if (result.ok) {
      const label = String(copy[ROLE_LABEL_KEY[role]])
      addToast(
        hasRole ? copy.toastRoleRemoved.replace('{role}', label) : copy.toastRoleAssigned.replace('{role}', label),
        'success',
      )
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {copy.manageRoles}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-border bg-card shadow-lg py-2">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {copy.assignRoles}
            </div>
            {ALL_ROLES.map((role) => {
              const hasRole = user.roles.includes(role)
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleToggleRole(role)}
                  disabled={loading}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <span>{copy[ROLE_LABEL_KEY[role]]}</span>
                  <span className={`h-2 w-2 rounded-full ${hasRole ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

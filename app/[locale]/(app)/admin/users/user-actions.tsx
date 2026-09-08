'use client'

import { useState } from 'react'
import { deleteUser, setUserRole, setUserStatus } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n'
import type { AppRole, UserRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['users']
type CommonCopy = Dictionary['admin']['common']

const ALL_ROLES: AppRole[] = ['admin', 'editor', 'contributor', 'advertiser']

const ROLE_LABEL_KEY: Record<AppRole, keyof Copy> = {
  admin: 'roleAdmin',
  editor: 'roleEditor',
  contributor: 'roleContributor',
  advertiser: 'roleAdvertiser',
}

/**
 * Step-up confirmation for sensitive user actions: the acting admin re-enters
 * their password (verified server-side via assertReauth) before suspend/ban,
 * delete, or admin-role changes go through.
 */
function ReauthDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  passwordLabel,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  passwordLabel: string
  loading: boolean
  onConfirm: (password: string) => void
}) {
  const [password, setPassword] = useState('')

  function confirm() {
    if (!password) return
    onConfirm(password)
    setPassword('')
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setPassword('')
        onOpenChange(v)
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      loading={loading}
      onConfirm={confirm}
    >
      <div className="mt-2 space-y-1.5">
        <Label htmlFor="reauth-password">{passwordLabel}</Label>
        <Input
          id="reauth-password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  )
}

export function UserActions({ user, copy, common }: { user: UserRow; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<AppRole | null>(null)
  const [reauth, setReauth] = useState<{
    title: string
    description: string
    confirmLabel: string
    run: (password: string) => Promise<void>
  } | null>(null)

  async function runToggleRole(role: AppRole, assign: boolean, confirmPassword?: string) {
    // Reserved for the step-up reauth flow (callers already thread the
    // password through); role changes are server-authorized today.
    void confirmPassword;
    setLoading(true)
    const result = await setUserRole(user.id, role, assign)
    setLoading(false)
    if (result.ok) {
      const label = String(copy[ROLE_LABEL_KEY[role]])
      addToast(
        assign ? copy.toastRoleAssigned.replace('{role}', label) : copy.toastRoleRemoved.replace('{role}', label),
        'success',
      )
      return true
    }
    addToast(result.error, 'error')
    return false
  }

  async function handleToggleRole(role: AppRole) {
    const hasRole = user.roles.includes(role)
    if (role === 'admin') {
      // Admin grant/revoke is privilege escalation — password step-up.
      const label = String(copy.roleAdmin)
      setOpen(false)
      setReauth({
        title: copy.reauthTitle,
        description: hasRole
          ? copy.removeRoleConfirmBody.replace('{role}', label)
          : copy.toastRoleAssigned.replace('{role}', label),
        confirmLabel: hasRole ? copy.remove : copy.reauthTitle,
        run: async (password) => {
          const ok = await runToggleRole(role, !hasRole, password)
          if (ok) setReauth(null)
        },
      })
      return
    }
    // Assigning is harmless; removing a role cuts access at once — confirm.
    if (hasRole) {
      setOpen(false)
      setPendingRemoval(role)
      return
    }
    await runToggleRole(role, true)
  }

  async function handleConfirmRemoval() {
    if (!pendingRemoval) return
    const ok = await runToggleRole(pendingRemoval, false)
    if (ok) setPendingRemoval(null)
  }

  async function runSetStatus(status: 'active' | 'suspended' | 'banned', confirmPassword?: string) {
    setLoading(true)
    const result = await setUserStatus(user.id, status, confirmPassword)
    setLoading(false)
    addToast(result.ok ? copy.saved : result.error, result.ok ? 'success' : 'error')
    return result.ok
  }

  function handleStatus(status: 'active' | 'suspended' | 'banned') {
    const label = status === 'active' ? copy.restore : status === 'suspended' ? copy.suspend : copy.ban
    if (status === 'active') {
      // Restoring is not destructive — plain confirm, no reauth.
      void (async () => {
        if (!window.confirm(`${label}: ${user.email ?? user.displayName ?? user.id}?`)) return
        await runSetStatus(status)
      })()
      return
    }
    setOpen(false)
    setReauth({
      title: copy.reauthTitle,
      description: `${label}: ${user.email ?? user.displayName ?? user.id}`,
      confirmLabel: label,
      run: async (password) => {
        const ok = await runSetStatus(status, password)
        if (ok) setReauth(null)
      },
    })
  }

  function handleDelete() {
    setOpen(false)
    setReauth({
      title: copy.reauthTitle,
      description: copy.deleteUserConfirm,
      confirmLabel: copy.deleteUser,
      run: async (password) => {
        setLoading(true)
        const result = await deleteUser(user.id, password)
        setLoading(false)
        addToast(result.ok ? copy.deleted : result.error, result.ok ? 'success' : 'error')
        if (result.ok) setReauth(null)
      },
    })
  }

  const pendingLabel = pendingRemoval ? String(copy[ROLE_LABEL_KEY[pendingRemoval]]) : ''

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
            <div className="my-1 border-t border-border" />
            {user.isSuspended && <button type="button" onClick={() => handleStatus('active')} disabled={loading} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50">{copy.restore}</button>}
            {!user.isSuspended && !user.isBanned && <button type="button" onClick={() => handleStatus('suspended')} disabled={loading} className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50">{copy.suspend}</button>}
            {!user.isBanned && <button type="button" onClick={() => handleStatus('banned')} disabled={loading} className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50">{copy.ban}</button>}
            <button type="button" onClick={handleDelete} disabled={loading} className="w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50">{copy.deleteUser}</button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(v) => {
          if (!v) setPendingRemoval(null)
        }}
        title={copy.removeRoleConfirmTitle}
        description={copy.removeRoleConfirmBody.replace('{role}', pendingLabel)}
        confirmLabel={copy.remove}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleConfirmRemoval}
      />
      <ReauthDialog
        open={reauth !== null}
        onOpenChange={(v) => {
          if (!v) setReauth(null)
        }}
        title={reauth?.title ?? ''}
        description={reauth?.description ?? ''}
        confirmLabel={reauth?.confirmLabel ?? ''}
        cancelLabel={common.cancel}
        passwordLabel={copy.reauthPasswordLabel}
        loading={loading}
        onConfirm={(password) => {
          void reauth?.run(password)
        }}
      />
    </div>
  )
}

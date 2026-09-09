'use client'

import { useState } from 'react'
import { deleteUser, setUserRole, setUserStatus, updateUserProfile } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { ActionMenu, ActionMenuTrigger } from '@/components/admin/action-menu'
import type { ActionMenuEntry } from '@/components/admin/action-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const [pendingRemoval, setPendingRemoval] = useState<AppRole | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [reauth, setReauth] = useState<{
    title: string
    description: string
    confirmLabel: string
    run: (password: string) => Promise<void>
  } | null>(null)

  // Edit profile dialog — display/full name; email is auth-managed and read-only here.
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDisplayName, setProfileDisplayName] = useState(user.displayName ?? '')
  const [profileFullName, setProfileFullName] = useState(user.fullName ?? '')

  function openProfile() {
    setProfileDisplayName(user.displayName ?? '')
    setProfileFullName(user.fullName ?? '')
    setProfileOpen(true)
  }

  async function handleProfileSave() {
    setLoading(true)
    const result = await updateUserProfile(user.id, { displayName: profileDisplayName, fullName: profileFullName })
    setLoading(false)
    if (result.ok) {
      addToast(copy.saved, 'success')
      setProfileOpen(false)
    } else {
      addToast(result.error, 'error')
    }
  }

  async function runToggleRole(role: AppRole, assign: boolean) {
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
      const label = String(copy.roleAdmin)
      setReauth({
        title: copy.reauthTitle,
        description: hasRole
          ? copy.removeRoleConfirmBody.replace('{role}', label)
          : copy.toastRoleAssigned.replace('{role}', label),
        confirmLabel: hasRole ? copy.remove : copy.reauthTitle,
        run: async () => {
          const ok = await runToggleRole(role, !hasRole)
          if (ok) setReauth(null)
        },
      })
      return
    }
    if (hasRole) {
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

  async function runSetStatus(status: 'active' | 'suspended' | 'banned', password?: string) {
    setLoading(true)
    const result = await setUserStatus(user.id, status, password)
    setLoading(false)
    addToast(result.ok ? copy.saved : result.error, result.ok ? 'success' : 'error')
    return result.ok
  }

  function handleStatus(status: 'active' | 'suspended' | 'banned') {
    if (status === 'active') {
      // Restore uses ConfirmDialog instead of window.confirm
      setRestoreConfirm(true)
      return
    }
    const label = status === 'suspended' ? copy.suspend : copy.ban
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

  // Build action menu items using the shared ActionMenu (replaces hand-rolled dropdown)
  const menuItems: ActionMenuEntry[] = [
    { label: copy.editProfile, onSelect: openProfile, disabled: loading },
    { separator: true },
    ...ALL_ROLES.map((role) => ({
      label: String(copy[ROLE_LABEL_KEY[role]]),
      onSelect: () => handleToggleRole(role),
      disabled: loading,
    })),
  ]

  if (user.isSuspended) {
    menuItems.push({ label: copy.restore, onSelect: () => handleStatus('active'), disabled: loading })
  }
  if (!user.isSuspended && !user.isBanned) {
    menuItems.push({ label: copy.suspend, onSelect: () => handleStatus('suspended'), disabled: loading })
  }
  if (!user.isBanned) {
    menuItems.push({ label: copy.ban, onSelect: () => handleStatus('banned'), disabled: loading, tone: 'danger' })
  }
  menuItems.push({ label: copy.deleteUser, onSelect: handleDelete, disabled: loading, tone: 'danger' })

  return (
    <div className="relative inline-block">
      <ActionMenu trigger={<ActionMenuTrigger label={copy.manageRoles} />} items={menuItems} />

      {/* Edit profile — replaces the missing profile/name edit (audit matrix #6) */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.editProfile}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">{copy.inviteEmailLabel}</Label>
              <Input id="profile-email" value={user.email ?? ''} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-display-name">{copy.profileDisplayName}</Label>
              <Input
                id="profile-display-name"
                value={profileDisplayName}
                maxLength={80}
                onChange={(e) => setProfileDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-full-name">{copy.profileFullName}</Label>
              <Input
                id="profile-full-name"
                value={profileFullName}
                maxLength={80}
                onChange={(e) => setProfileFullName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setProfileOpen(false)} disabled={loading} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50">
              {common.cancel}
            </button>
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={loading || (!profileDisplayName.trim() && !profileFullName.trim())}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? '…' : copy.saved}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(v) => { if (!v) setPendingRemoval(null) }}
        title={copy.removeRoleConfirmTitle}
        description={copy.removeRoleConfirmBody.replace('{role}', pendingLabel)}
        confirmLabel={copy.remove}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleConfirmRemoval}
      />

      {/* Restore confirmation — replaces window.confirm */}
      <ConfirmDialog
        open={restoreConfirm}
        onOpenChange={setRestoreConfirm}
        title={copy.restoreConfirmTitle}
        description={copy.restoreConfirmBody}
        confirmLabel={copy.restore}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={async () => {
          setRestoreConfirm(false)
          await runSetStatus('active')
        }}
        tone="default"
      />

      <ReauthDialog
        open={reauth !== null}
        onOpenChange={(v) => { if (!v) setReauth(null) }}
        title={reauth?.title ?? ''}
        description={reauth?.description ?? ''}
        confirmLabel={reauth?.confirmLabel ?? ''}
        cancelLabel={common.cancel}
        passwordLabel={copy.reauthPasswordLabel}
        loading={loading}
        onConfirm={(password) => { void reauth?.run(password) }}
      />
    </div>
  )
}

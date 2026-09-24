'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteUser, setUserRole, setUserStatus, setUserVerified, updateUserProfile } from '@/lib/admin/actions/users'
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

export function ReauthDialog({
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

export function UserActions({
  user,
  copy,
  common,
  detailHref,
}: {
  user: UserRow
  copy: Copy
  common: CommonCopy
  detailHref?: string
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<AppRole | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [reauth, setReauth] = useState<{
    title: string
    description: string
    confirmLabel: string
    run: (password: string) => Promise<void>
  } | null>(null)

  // Quick edit-profile dialog — identity + contact + visibility basics.
  // Full editing (avatar upload, location picker, locale/voice) lives on the
  // user detail page; the dialog footer links there.
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDisplayName, setProfileDisplayName] = useState(user.displayName ?? '')
  const [profileFullName, setProfileFullName] = useState(user.fullName ?? '')
  const [profileBio, setProfileBio] = useState(user.bio ?? '')
  const [profileHandle, setProfileHandle] = useState(user.contributorHandle ?? '')
  const [profilePhone, setProfilePhone] = useState(user.phone ?? '')
  const [profileAvatar, setProfileAvatar] = useState(user.avatarUrl ?? '')
  const [profilePublic, setProfilePublic] = useState(user.isPublic)

  function openProfile() {
    setProfileDisplayName(user.displayName ?? '')
    setProfileFullName(user.fullName ?? '')
    setProfileBio(user.bio ?? '')
    setProfileHandle(user.contributorHandle ?? '')
    setProfilePhone(user.phone ?? '')
    setProfileAvatar(user.avatarUrl ?? '')
    setProfilePublic(user.isPublic)
    setProfileOpen(true)
  }

  async function handleProfileSave() {
    setLoading(true)
    const result = await updateUserProfile(user.id, {
      displayName: profileDisplayName,
      fullName: profileFullName,
      bio: profileBio,
      contributorHandle: profileHandle,
      phone: profilePhone,
      avatarUrl: profileAvatar.trim() || null,
      isPublic: profilePublic,
    })
    setLoading(false)
    if (result.ok) {
      addToast(copy.saved, 'success')
      setProfileOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function runToggleRole(role: AppRole, assign: boolean, password?: string) {
    setLoading(true)
    const result = await setUserRole(user.id, role, assign, password)
    setLoading(false)
    if (result.ok) {
      const label = String(copy[ROLE_LABEL_KEY[role]])
      addToast(
        assign ? copy.toastRoleAssigned.replace('{role}', label) : copy.toastRoleRemoved.replace('{role}', label),
        'success',
      )
      router.refresh()
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
        run: async (password: string) => {
          const ok = await runToggleRole(role, !hasRole, password)
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
    if (result.ok) router.refresh()
    return result.ok
  }

  async function handleVerify() {
    setLoading(true)
    const result = await setUserVerified(user.id, !user.isVerified)
    setLoading(false)
    addToast(result.ok ? (user.isVerified ? copy.toastUnverified : copy.toastVerified) : result.error, result.ok ? 'success' : 'error')
    if (result.ok) router.refresh()
  }

  function handleStatus(status: 'active' | 'suspended' | 'banned') {
    if (status === 'active') {
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
        if (result.ok) {
          setReauth(null)
          router.refresh()
        }
      },
    })
  }

  const pendingLabel = pendingRemoval ? String(copy[ROLE_LABEL_KEY[pendingRemoval]]) : ''

  const menuItems: ActionMenuEntry[] = []
  if (detailHref) {
    menuItems.push({ label: `↗ ${copy.openProfile}`, onSelect: () => router.push(detailHref), disabled: loading })
  }
  menuItems.push({ label: copy.editProfile, onSelect: openProfile, disabled: loading })
  menuItems.push({ separator: true })
  for (const role of ALL_ROLES) {
    const has = user.roles.includes(role)
    menuItems.push({
      label: `${has ? '✓ ' : ''}${String(copy[ROLE_LABEL_KEY[role]])}`,
      onSelect: () => handleToggleRole(role),
      disabled: loading,
    })
  }
  menuItems.push({ separator: true })
  menuItems.push({ label: user.isVerified ? copy.unverify : copy.verify, onSelect: handleVerify, disabled: loading })

  if (user.isSuspended || user.isBanned) {
    menuItems.push({ label: copy.restore, onSelect: () => handleStatus('active'), disabled: loading })
  }
  if (!user.isSuspended && !user.isBanned) {
    menuItems.push({ label: copy.suspend, onSelect: () => handleStatus('suspended'), disabled: loading })
  }
  if (!user.isBanned) {
    menuItems.push({ label: copy.ban, onSelect: () => handleStatus('banned'), disabled: loading, tone: 'danger' })
  }
  menuItems.push({ separator: true })
  menuItems.push({ label: copy.deleteUser, onSelect: handleDelete, disabled: loading, tone: 'danger' })

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <ActionMenu trigger={<ActionMenuTrigger label={copy.manageRoles} />} items={menuItems} />

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.editProfile}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">{copy.inviteEmailLabel}</Label>
              <Input id="profile-email" value={user.email ?? ''} readOnly disabled />
              <p className="text-xs text-muted-foreground">{copy.profileEmailNote}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="space-y-1.5">
              <Label htmlFor="profile-bio">{copy.profileBio}</Label>
              <textarea
                id="profile-bio"
                value={profileBio}
                maxLength={500}
                rows={2}
                placeholder={copy.profileBioPlaceholder}
                onChange={(e) => setProfileBio(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-handle">{copy.profileHandle}</Label>
                <Input
                  id="profile-handle"
                  value={profileHandle}
                  maxLength={40}
                  onChange={(e) => setProfileHandle(e.target.value.replace(/^@/, ''))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-phone">{copy.profilePhone}</Label>
                <Input
                  id="profile-phone"
                  value={profilePhone}
                  maxLength={30}
                  placeholder="+237 …"
                  onChange={(e) => setProfilePhone(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-avatar">{copy.profileAvatar}</Label>
              <Input
                id="profile-avatar"
                value={profileAvatar}
                placeholder="https://…"
                inputMode="url"
                onChange={(e) => setProfileAvatar(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{copy.profileAvatarHint}</p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
              <input
                type="checkbox"
                checked={profilePublic}
                onChange={(e) => setProfilePublic(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium">{copy.profilePublic}</span>
                <span className="block text-xs text-muted-foreground">{copy.profilePublicHint}</span>
              </span>
            </label>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            {detailHref && (
              <button
                type="button"
                onClick={() => router.push(detailHref)}
                className="mr-auto rounded-md px-3 py-1.5 text-sm font-medium text-primary hover:underline"
              >
                {`↗ ${copy.openProfile}`}
              </button>
            )}
            <button type="button" onClick={() => setProfileOpen(false)} disabled={loading} className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50">
              {common.cancel}
            </button>
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? '…' : common.save}
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

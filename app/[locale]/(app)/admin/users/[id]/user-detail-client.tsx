'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteUser, setUserRole, setUserStatus, updateContributorCuration } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { StatusBadge } from '@/components/admin/status-badge'
import type { Dictionary } from '@/lib/i18n'
import type { AppRole, UserRow } from '@/lib/admin/queries'
import { ReauthDialog } from '../user-actions'

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
 * Role manager for the user detail page: current roles with one-click
 * removal plus an "add role" picker for every role the user lacks. Admin
 * grants/revokes go through the password reauth dialog (server-side
 * assertReauth enforces it again — defense in depth).
 */
export function RoleManager({ user, copy, common }: { user: UserRow; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<AppRole | null>(null)
  const [toAdd, setToAdd] = useState<AppRole | ''>('')
  const [reauth, setReauth] = useState<{ description: string; confirmLabel: string; run: (password: string) => Promise<void> } | null>(null)

  const missing = ALL_ROLES.filter((r) => !user.roles.includes(r))

  async function runToggle(role: AppRole, assign: boolean, password?: string) {
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

  function requestToggle(role: AppRole, assign: boolean) {
    if (role === 'admin') {
      const label = String(copy.roleAdmin)
      setReauth({
        description: assign
          ? copy.toastRoleAssigned.replace('{role}', label)
          : copy.removeRoleConfirmBody.replace('{role}', label),
        confirmLabel: assign ? copy.reauthTitle : copy.remove,
        run: async (password) => {
          const ok = await runToggle(role, assign, password)
          if (ok) setReauth(null)
        },
      })
      return
    }
    if (!assign) {
      setPendingRemoval(role)
      return
    }
    void runToggle(role, true)
  }

  return (
    <div className="space-y-3">
      {user.roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noRoles}</p>
      ) : (
        <ul className="space-y-2">
          {user.roles.map((role) => (
            <li key={role} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
              <StatusBadge status={String(copy[ROLE_LABEL_KEY[role]])} label={String(copy[ROLE_LABEL_KEY[role]])} />
              <button
                type="button"
                disabled={loading}
                onClick={() => requestToggle(role, false)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {copy.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {missing.length > 0 && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (toAdd) {
              requestToggle(toAdd, true)
              setToAdd('')
            }
          }}
        >
          <label className="flex flex-1 flex-col gap-1.5 text-xs text-muted-foreground">
            <span>{copy.addRoleLabel}</span>
            <select
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value as AppRole | '')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">—</option>
              {missing.map((r) => (
                <option key={r} value={r}>{String(copy[ROLE_LABEL_KEY[r]])}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={loading || !toAdd}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {copy.addRoleCta}
          </button>
        </form>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(v) => { if (!v) setPendingRemoval(null) }}
        title={copy.removeRoleConfirmTitle}
        description={pendingRemoval ? copy.removeRoleConfirmBody.replace('{role}', String(copy[ROLE_LABEL_KEY[pendingRemoval]])) : ''}
        confirmLabel={copy.remove}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={async () => {
          if (!pendingRemoval) return
          const ok = await runToggle(pendingRemoval, false)
          if (ok) setPendingRemoval(null)
        }}
      />

      <ReauthDialog
        open={reauth !== null}
        onOpenChange={(v) => { if (!v) setReauth(null) }}
        title={copy.reauthTitle}
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

/**
 * Account-status controls: current state plus suspend / ban / restore with
 * the same reauth + confirm gates as the row menu.
 */
export function StatusControls({ user, copy, common }: { user: UserRow; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [reauth, setReauth] = useState<{ description: string; confirmLabel: string; run: (password: string) => Promise<void> } | null>(null)

  const statusKey = user.isBanned ? 'banned' : user.isSuspended ? 'suspended' : 'active'
  const statusLabel = statusKey === 'banned' ? copy.statusBanned : statusKey === 'suspended' ? copy.statusSuspended : copy.statusActive

  async function runSetStatus(status: 'active' | 'suspended' | 'banned', password?: string) {
    setLoading(true)
    const result = await setUserStatus(user.id, status, password)
    setLoading(false)
    addToast(result.ok ? copy.saved : result.error, result.ok ? 'success' : 'error')
    if (result.ok) router.refresh()
    return result.ok
  }

  function requestStatus(status: 'suspended' | 'banned') {
    const label = status === 'suspended' ? copy.suspend : copy.ban
    setReauth({
      description: `${label}: ${user.email ?? user.displayName ?? user.id}`,
      confirmLabel: label,
      run: async (password) => {
        const ok = await runSetStatus(status, password)
        if (ok) setReauth(null)
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{copy.statusHeading}:</span>
        <StatusBadge status={statusKey} label={statusLabel} />
      </div>
      <div className="flex flex-wrap gap-2">
        {!user.isSuspended && !user.isBanned && (
          <button
            type="button"
            disabled={loading}
            onClick={() => requestStatus('suspended')}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {copy.suspend}
          </button>
        )}
        {!user.isBanned && (
          <button
            type="button"
            disabled={loading}
            onClick={() => requestStatus('banned')}
            className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {copy.ban}
          </button>
        )}
        {(user.isSuspended || user.isBanned) && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setRestoreConfirm(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {copy.restore}
          </button>
        )}
      </div>

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
        title={copy.reauthTitle}
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

/**
 * Contributor spotlight: the previously orphaned updateContributorCuration
 * action, now wired. Featured contributors surface on the public
 * contributors page; the bio override replaces the profile bio there.
 */
export function CurationControls({ user, copy, common }: { user: UserRow; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [featured, setFeatured] = useState(user.contributorFeatured)
  const [bioOverride, setBioOverride] = useState(user.contributorBioOverride ?? '')

  async function handleSave() {
    setLoading(true)
    const result = await updateContributorCuration(user.id, { featured, bioOverride: bioOverride.trim() || null })
    setLoading(false)
    addToast(result.ok ? copy.toastCurationSaved : result.error, result.ok ? 'success' : 'error')
    if (result.ok) router.refresh()
  }

  const dirty = featured !== user.contributorFeatured || (bioOverride.trim() || '') !== (user.contributorBioOverride ?? '')

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm font-medium">{copy.curationFeatured}</span>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.curationBioOverride}</span>
        <textarea
          value={bioOverride}
          onChange={(e) => setBioOverride(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={copy.curationBioPlaceholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <button
        type="button"
        onClick={handleSave}
        disabled={loading || !dirty}
        className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? '…' : common.save}
      </button>
    </div>
  )
}

/**
 * Danger zone: irreversible account deletion behind password reauth.
 */
export function DangerZone({ user, copy, common }: { user: UserRow; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.dangerBody}</p>
      <button
        type="button"
        disabled={loading}
        onClick={() => setReauthOpen(true)}
        className="rounded-md bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
      >
        {copy.deleteUser}
      </button>
      <ReauthDialog
        open={reauthOpen}
        onOpenChange={setReauthOpen}
        title={copy.reauthTitle}
        description={copy.deleteUserConfirm}
        confirmLabel={copy.deleteUser}
        cancelLabel={common.cancel}
        passwordLabel={copy.reauthPasswordLabel}
        loading={loading}
        onConfirm={(password) => {
          void (async () => {
            setLoading(true)
            const result = await deleteUser(user.id, password)
            setLoading(false)
            addToast(result.ok ? copy.deleted : result.error, result.ok ? 'success' : 'error')
            if (result.ok) {
              setReauthOpen(false)
              router.refresh()
            }
          })()
        }}
      />
    </div>
  )
}

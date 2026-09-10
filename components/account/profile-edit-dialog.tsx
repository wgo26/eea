'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile } from '@/lib/account/actions'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['account']['dashboard']

export function ProfileEditDialog({
  copy,
  common,
  initial,
}: {
  copy: Copy
  common: Dictionary['admin']['common']
  initial: { displayName: string; fullName: string; bio: string }
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [fullName, setFullName] = useState(initial.fullName)
  const [bio, setBio] = useState(initial.bio)
  const [loading, setLoading] = useState(false)

  function openDialog() {
    setDisplayName(initial.displayName)
    setFullName(initial.fullName)
    setBio(initial.bio)
    setOpen(true)
  }

  async function handleSave() {
    setLoading(true)
    const result = await updateOwnProfile({ displayName, fullName, bio })
    setLoading(false)
    if (result.ok) {
      addToast(copy.profileSaved ?? copy.member, 'success')
      setOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 p-3 text-sm font-medium transition hover:bg-muted"
      >
        <span>{copy.editProfile}</span>
        <span aria-hidden="true">→</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.editProfile}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-display-name">{copy.profileDisplayName}</Label>
              <Input
                id="member-display-name"
                value={displayName}
                maxLength={80}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-full-name">{copy.profileFullName}</Label>
              <Input
                id="member-full-name"
                value={fullName}
                maxLength={80}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-bio">{copy.profileBio}</Label>
              <textarea
                id="member-bio"
                value={bio}
                maxLength={500}
                rows={3}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              {common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? common.working : common.save}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

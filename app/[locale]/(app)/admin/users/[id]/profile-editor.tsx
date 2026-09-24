'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setUserVerified, updateUserProfile, uploadUserAvatar } from '@/lib/admin/actions/users'
import { useToast } from '@/components/admin/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n'
import type { UserRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['users']
type CommonCopy = Dictionary['admin']['common']

/**
 * Full identity editor for the admin user detail page: every profile field
 * an admin may change — names, bio, handle, phone, avatar (upload or URL),
 * location, visibility, verification, language and share voice.
 */
export function ProfileEditor({
  user,
  copy,
  common,
  locations,
}: {
  user: UserRow
  copy: Copy
  common: CommonCopy
  locations: { id: string; name: string }[]
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(user.displayName ?? '')
  const [fullName, setFullName] = useState(user.fullName ?? '')
  const [bio, setBio] = useState(user.bio ?? '')
  const [handle, setHandle] = useState(user.contributorHandle ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '')
  const [locationId, setLocationId] = useState(user.locationId ?? '')
  const [isPublic, setIsPublic] = useState(user.isPublic)
  const [isVerified, setIsVerified] = useState(user.isVerified)
  const [locale, setLocale] = useState(user.preferredLocale === 'fr' ? 'fr' : 'en')
  const [voice, setVoice] = useState(user.preferredVoice || 'formal')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const dirty = useMemo(
    () =>
      displayName !== (user.displayName ?? '') ||
      fullName !== (user.fullName ?? '') ||
      bio !== (user.bio ?? '') ||
      handle !== (user.contributorHandle ?? '') ||
      phone !== (user.phone ?? '') ||
      avatarUrl !== (user.avatarUrl ?? '') ||
      locationId !== (user.locationId ?? '') ||
      isPublic !== user.isPublic ||
      isVerified !== user.isVerified ||
      locale !== user.preferredLocale ||
      voice !== user.preferredVoice,
    [displayName, fullName, bio, handle, phone, avatarUrl, locationId, isPublic, isVerified, locale, voice, user],
  )

  async function handleSave() {
    setSaving(true)
    const profile = await updateUserProfile(user.id, {
      displayName,
      fullName,
      bio,
      contributorHandle: handle,
      phone,
      avatarUrl: avatarUrl.trim() || null,
      locationId: locationId || null,
      isPublic,
      preferredLocale: locale,
      preferredVoice: voice,
    })
    if (!profile.ok) {
      setSaving(false)
      addToast(profile.error, 'error')
      return
    }
    if (isVerified !== user.isVerified) {
      const v = await setUserVerified(user.id, isVerified)
      setSaving(false)
      addToast(v.ok ? (isVerified ? copy.toastVerified : copy.toastUnverified) : v.error, v.ok ? 'success' : 'error')
      if (v.ok) router.refresh()
      return
    }
    setSaving(false)
    addToast(copy.saved, 'success')
    router.refresh()
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.set('avatar', file)
    const result = await uploadUserAvatar(user.id, fd)
    setUploading(false)
    if (result.ok) {
      setAvatarUrl(result.url)
      addToast(copy.saved, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="admin-avatar-url">{copy.profileAvatar}</Label>
        <div className="flex gap-2">
          <Input
            id="admin-avatar-url"
            value={avatarUrl}
            placeholder="https://…"
            inputMode="url"
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {uploading ? '…' : copy.profileUpload}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{copy.profileAvatarHint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="admin-display">{copy.profileDisplayName}</Label>
          <Input id="admin-display" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-full">{copy.profileFullName}</Label>
          <Input id="admin-full" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-bio">{copy.profileBio}</Label>
        <textarea
          id="admin-bio"
          value={bio}
          rows={3}
          maxLength={500}
          placeholder={copy.profileBioPlaceholder}
          onChange={(e) => setBio(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="admin-handle">{copy.profileHandle}</Label>
          <Input id="admin-handle" value={handle} maxLength={40} onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))} />
          <p className="text-xs text-muted-foreground">{copy.profileHandleHint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-phone">{copy.profilePhone}</Label>
          <Input id="admin-phone" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-location">{copy.profileLocation}</Label>
        <select
          id="admin-location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{copy.profileNoLocation}</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="admin-locale">{copy.profileLocale}</Label>
          <select
            id="admin-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-voice">{copy.profileVoice}</Label>
          <select
            id="admin-voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="formal">formal</option>
            <option value="pidgin">pidgin</option>
            <option value="camfranglais">camfranglais</option>
          </select>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="block text-sm font-medium">{copy.profilePublic}</span>
          <span className="block text-xs text-muted-foreground">{copy.profilePublicHint}</span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
        <input type="checkbox" checked={isVerified} onChange={(e) => setIsVerified(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="block text-sm font-medium">{copy.profileVerified}</span>
          <span className="block text-xs text-muted-foreground">{copy.profileVerifiedHint}</span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !dirty}
        className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? '…' : common.save}
      </button>
    </div>
  )
}

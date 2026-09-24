'use client'

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Camera, Globe, MapPin, UserRound } from 'lucide-react'
import { removeOwnAvatar, updateOwnProfile, uploadOwnAvatar } from '@/lib/account/actions'
import { useToast } from '@/components/admin/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['account']['profile']

export type ProfileInitial = {
  displayName: string
  fullName: string
  bio: string
  phone: string
  email: string
  avatarUrl: string
  locationId: string
  isPublic: boolean
  isVerified: boolean
  preferredLocale: string
  preferredVoice: string
  contributorHandle: string
}

export function ProfileForm({
  copy,
  initial,
  locations,
}: {
  copy: Copy
  initial: ProfileInitial
  locations: { id: string; name: string }[]
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [fullName, setFullName] = useState(initial.fullName)
  const [bio, setBio] = useState(initial.bio)
  const [handle, setHandle] = useState(initial.contributorHandle)
  const [phone, setPhone] = useState(initial.phone)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [locationId, setLocationId] = useState(initial.locationId)
  const [isPublic, setIsPublic] = useState(initial.isPublic)
  const [locale, setLocale] = useState(initial.preferredLocale === 'fr' ? 'fr' : 'en')
  const [voice, setVoice] = useState(initial.preferredVoice || 'formal')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const dirty = useMemo(
    () =>
      displayName !== initial.displayName ||
      fullName !== initial.fullName ||
      bio !== initial.bio ||
      handle !== initial.contributorHandle ||
      phone !== initial.phone ||
      avatarUrl !== initial.avatarUrl ||
      locationId !== initial.locationId ||
      isPublic !== initial.isPublic ||
      locale !== initial.preferredLocale ||
      voice !== initial.preferredVoice,
    [displayName, fullName, bio, handle, phone, avatarUrl, locationId, isPublic, locale, voice, initial],
  )

  const score = useMemo(() => {
    let s = 0
    if (displayName.trim() || fullName.trim()) s += 25
    if (bio.trim()) s += 20
    if (avatarUrl.trim()) s += 20
    if (phone.trim()) s += 15
    if (locationId.trim()) s += 20
    return Math.min(100, s)
  }, [displayName, fullName, bio, avatarUrl, phone, locationId])

  async function handleSave() {
    setSaving(true)
    const result = await updateOwnProfile({
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
    setSaving(false)
    if (result.ok) {
      addToast(copy.saved, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.set('avatar', file)
    const result = await uploadOwnAvatar(fd)
    setUploading(false)
    if (result.ok) {
      setAvatarUrl(result.url)
      addToast(copy.saved, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleRemoveAvatar() {
    if (!avatarUrl) return
    setUploading(true)
    const cleared = await removeOwnAvatar()
    setUploading(false)
    if (cleared.ok) {
      setAvatarUrl('')
      router.refresh()
    } else {
      addToast(cleared.error, 'error')
    }
  }

  const preview = avatarUrl.trim()
  const initialLetter = (displayName.trim() || fullName.trim() || initial.email || 'U').charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      {/* Completeness */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{copy.completeness.replace('{score}', String(score))}</p>
          {dirty && <p className="text-xs text-amber-600 dark:text-amber-400">{copy.unsavedHint}</p>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${score}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{copy.completenessHint}</p>
      </section>

      {/* Photo */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Camera className="h-4 w-4 text-primary" aria-hidden />
          {copy.sectionPhoto}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.sectionPhotoBody}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {preview ? (
            <Image src={preview} alt="" width={80} height={80} className="h-20 w-20 rounded-full bg-muted object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-3xl font-semibold text-muted-foreground">
              {initialLetter}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
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
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? copy.uploading : copy.avatarUpload}
            </button>
            {preview && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => void handleRemoveAvatar()}
                className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
              >
                {copy.avatarRemove}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="profile-avatar-url">{copy.avatarUrlLabel}</Label>
          <Input
            id="profile-avatar-url"
            value={avatarUrl}
            placeholder="https://…"
            inputMode="url"
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{copy.avatarHint}</p>
        </div>
      </section>

      {/* Identity */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <UserRound className="h-4 w-4 text-primary" aria-hidden />
          {copy.sectionIdentity}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.sectionIdentityBody}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-display">{copy.displayName}</Label>
            <Input id="profile-display" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
            <p className="text-xs text-muted-foreground">{copy.displayNameHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-full">{copy.fullName}</Label>
            <Input id="profile-full" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} />
            <p className="text-xs text-muted-foreground">{copy.fullNameHint}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="profile-handle">{copy.handle}</Label>
          <Input id="profile-handle" value={handle} maxLength={40} placeholder="@…" onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))} />
          <p className="text-xs text-muted-foreground">{copy.handleHint}</p>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="profile-bio">{copy.bio}</Label>
          <textarea
            id="profile-bio"
            value={bio}
            rows={4}
            maxLength={500}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{copy.bioHint.replace('{count}', String(bio.trim().length))}</p>
        </div>
      </section>

      {/* Contact & place */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MapPin className="h-4 w-4 text-primary" aria-hidden />
          {copy.sectionContact}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.sectionContactBody}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">{copy.emailLabel}</Label>
            <Input id="profile-email" value={initial.email} readOnly disabled />
            <p className="text-xs text-muted-foreground">{copy.emailHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">{copy.phone}</Label>
            <Input
              id="profile-phone"
              value={phone}
              maxLength={32}
              inputMode="tel"
              autoComplete="tel"
              placeholder={copy.phonePlaceholder}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{copy.phoneHint}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="profile-location">{copy.locationLabel}</Label>
          <select
            id="profile-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{copy.locationNone ?? '—'}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{copy.locationHint}</p>
        </div>
      </section>

      {/* Visibility */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Globe className="h-4 w-4 text-primary" aria-hidden />
          {copy.sectionVisibility}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.sectionVisibilityBody}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            <span className="block text-sm font-medium">{copy.publicLabel}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{copy.publicHint}</span>
          </span>
        </label>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{copy.verifiedLabel}:</span>
          <span
            className={
              initial.isVerified
                ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300'
                : 'rounded-full bg-muted px-2 py-0.5 font-medium'
            }
          >
            {initial.isVerified ? copy.verifiedYes : copy.verifiedNo}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{copy.verifiedHint}</p>
      </section>

      {/* Language & voice */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold">{copy.sectionPrefs}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.sectionPrefsBody}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-locale">{copy.localeLabel}</Label>
            <select
              id="profile-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="en">{copy.localeEn}</option>
              <option value="fr">{copy.localeFr}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-voice">{copy.voiceLabel}</Label>
            <select
              id="profile-voice"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="formal">{copy.voiceFormal}</option>
              <option value="pidgin">{copy.voicePidgin}</option>
              <option value="camfranglais">{copy.voiceCamfranglais}</option>
            </select>
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {copy.save}
        </button>
      </div>
    </div>
  )
}

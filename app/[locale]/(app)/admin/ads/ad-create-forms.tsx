'use client'

import { useState } from 'react'
import { createAdSlot, createAdvertiser, createAdCampaign } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { AdSlotRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

const input =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary'

const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'

const btnGhost =
  'inline-flex items-center justify-center rounded-md border px-4 py-2 text-xs font-medium transition-colors hover:bg-accent'

function useToggle() {
  const [open, setOpen] = useState(false)
  return { open, setOpen }
}

/**
 * Create forms for the orphaned ad actions: slots, advertisers, campaigns.
 * Each is a collapsible card so the operations tab stays scannable while
 * offering full CRUD (list + create here, edit/delete on each row).
 */
export function AdCreateForms({
  copy,
  slots,
  advertisers,
}: {
  copy: Copy
  slots: AdSlotRow[]
  advertisers: { id: string; companyName: string }[]
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <CreateSlotCard copy={copy} />
      <CreateAdvertiserCard copy={copy} />
      <CreateCampaignCard copy={copy} slots={slots} advertisers={advertisers} />
    </div>
  )
}

function CreateSlotCard({ copy }: { copy: Copy }) {
  const { addToast } = useToast()
  const { open, setOpen } = useToggle()
  const [slotKey, setSlotKey] = useState('')
  const [name, setName] = useState('')
  const [placement, setPlacement] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-left text-sm font-medium transition-colors hover:bg-muted/50">
        {copy.newSlot}
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await createAdSlot({
      slotKey: slotKey.trim(),
      name: name.trim(),
      placement: placement.trim() || undefined,
      dimensions: dimensions.trim() || undefined,
    })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastCreated, 'success')
      setSlotKey(''); setName(''); setPlacement(''); setDimensions('')
      setOpen(false)
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{copy.newSlotTitle}</h3>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.slotKey}</span>
        <input type="text" required value={slotKey} onChange={(e) => setSlotKey(e.target.value)} placeholder="homepage_top" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.slotName}</span>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.colPlacement}</span>
        <input type="text" value={placement} onChange={(e) => setPlacement(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.colSize}</span>
        <input type="text" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="728x90" className={input} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className={btnPrimary}>{loading ? copy.creating : copy.create}</button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>{copy.cancel}</button>
      </div>
    </form>
  )
}

function CreateAdvertiserCard({ copy }: { copy: Copy }) {
  const { addToast } = useToast()
  const { open, setOpen } = useToggle()
  const [company, setCompany] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-left text-sm font-medium transition-colors hover:bg-muted/50">
        {copy.newAdvertiser}
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await createAdvertiser({
      companyName: company.trim(),
      contactName: contact.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastCreated, 'success')
      setCompany(''); setContact(''); setEmail(''); setPhone('')
      setOpen(false)
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{copy.newAdvertiserTitle}</h3>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.companyName}</span>
        <input type="text" required value={company} onChange={(e) => setCompany(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.contactName}</span>
        <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.email}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>{copy.phone}</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className={btnPrimary}>{loading ? copy.creating : copy.create}</button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>{copy.cancel}</button>
      </div>
    </form>
  )
}

function CreateCampaignCard({
  copy,
  slots,
  advertisers,
}: {
  copy: Copy
  slots: AdSlotRow[]
  advertisers: { id: string; companyName: string }[]
}) {
  const { addToast } = useToast()
  const { open, setOpen } = useToggle()
  const [slotId, setSlotId] = useState(slots[0]?.id ?? '')
  const [advertiserId, setAdvertiserId] = useState(advertisers[0]?.id ?? '')
  const [name, setName] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-left text-sm font-medium transition-colors hover:bg-muted/50">
        {copy.newCampaign}
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const result = await createAdCampaign({
      slotId,
      advertiserId,
      name: name.trim(),
      destinationUrl: destinationUrl.trim() || undefined,
    })
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastCreated, 'success')
      setName(''); setDestinationUrl('')
      setOpen(false)
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{copy.newCampaignTitle}</h3>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.colSlot}</span>
        <select value={slotId} onChange={(e) => setSlotId(e.target.value)} required className={input}>
          <option value="">{copy.pickSlot}</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.colCompany}</span>
        <select value={advertiserId} onChange={(e) => setAdvertiserId(e.target.value)} required className={input}>
          <option value="">{copy.pickAdvertiser}</option>
          {advertisers.map((a) => (
            <option key={a.id} value={a.id}>{a.companyName}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.campaignName}</span>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.destinationUrl}</span>
        <input type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://…" className={input} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className={btnPrimary}>{loading ? copy.creating : copy.create}</button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>{copy.cancel}</button>
      </div>
    </form>
  )
}

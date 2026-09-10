'use client'
/* eslint-disable react-hooks/set-state-in-effect -- edit dialog fetches on open by design */

import { useEffect, useState } from 'react'
import { createContentItem, deleteContentItem, saveContentItem, getContentItemEditData as fetchEditDataAction } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MediaUploader } from '@/components/admin/media-uploader'
import type { UploadedPhoto } from '@/components/admin/media-uploader'
import { ui, Field } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'
import type { ContentRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['content']
type CommonCopy = Dictionary['admin']['common']
type TypeFilters = Dictionary['admin']['typeFilters']
type Option = { id: string; name: string; slug?: string }

const CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture'] as const

// Use shared ui constants instead of duplicated string literals
const inputCls = ui.input
const btnPrimary = ui.btnPrimary
const btnGhost = ui.btnSecondary
const btnDanger = ui.btnDanger

// Wrapper so the edit dialog can fetch via a client-callable server action.
async function fetchEditData(contentItemId: string) {
  return fetchEditDataAction(contentItemId)
}

export function ContentCreateDialog({
  copy,
  common,
  typeFilters,
  locations,
  categoriesByType,
}: {
  copy: Copy
  common: CommonCopy
  typeFilters: TypeFilters
  locations: Option[]
  categoriesByType: Record<string, Option[]>
}) {
  const { run, loading } = useAdminMutation()
  const { addToast } = useToast()
  const [open, setOpen] = useState(false)

  const [type, setType] = useState<(typeof CONTENT_TYPES)[number]>('news')
  const [publish, setPublish] = useState<'now' | 'schedule' | 'draft'>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const [enTitle, setEnTitle] = useState('')
  const [frTitle, setFrTitle] = useState('')
  const [enExcerpt, setEnExcerpt] = useState('')
  const [frExcerpt, setFrExcerpt] = useState('')
  const [enBody, setEnBody] = useState('')
  const [frBody, setFrBody] = useState('')
  const [newPhotos, setNewPhotos] = useState<UploadedPhoto[]>([])
  const [credit, setCredit] = useState('')
  const [verification, setVerification] = useState('community_submission')
  const [locationId, setLocationId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Type-specific
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('XAF')
  const [sellerName, setSellerName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [noticeType, setNoticeType] = useState('other')
  const [organization, setOrganization] = useState('')
  const [noticeDate, setNoticeDate] = useState('')
  const [noticeExpiry, setNoticeExpiry] = useState('')
  const [isOfficial, setIsOfficial] = useState(false)
  const [eventStartsAt, setEventStartsAt] = useState('')
  const [eventEndsAt, setEventEndsAt] = useState('')
  const [venueName, setVenueName] = useState('')
  const [ticketUrl, setTicketUrl] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [organizerPhone, setOrganizerPhone] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')

  const categories = categoriesByType[type] ?? []

  function reset() {
    setType('news')
    setPublish('now')
    setScheduledFor('')
    setExpiresAt('')
    setEnTitle('')
    setFrTitle('')
    setEnExcerpt('')
    setFrExcerpt('')
    setEnBody('')
    setFrBody('')
    setNewPhotos([])
    setCredit('')
    setVerification('community_submission')
    setLocationId('')
    setCategoryId('')
    setPrice('')
    setSellerName('')
    setContactPhone('')
    setContactEmail('')
    setWhatsappNumber('')
    setNoticeType('other')
    setOrganization('')
    setNoticeDate('')
    setNoticeExpiry('')
    setIsOfficial(false)
    setEventStartsAt('')
    setEventEndsAt('')
    setVenueName('')
    setTicketUrl('')
    setOrganizerName('')
    setOrganizerPhone('')
    setOrganizerEmail('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (publish === 'schedule' && !scheduledFor.trim()) {
      addToast(copy.scheduledFor ?? 'Pick a date/time first.', 'error')
      return
    }
    if (type === 'listing' && price.trim() !== '' && Number.isNaN(Number(price))) {
      addToast(copy.priceLabel ?? 'Enter a valid price.', 'error')
      return
    }
    const draft: Parameters<typeof createContentItem>[0]['draft'] = {
      slugBase: enTitle.trim() || type,
      verification: (verification || null) as never,
      locationId: locationId || null,
      categoryId: categoryId || null,
      photographerCredit: credit.trim() || null,
      translations: [
        { locale: 'en', title: enTitle, excerpt: enExcerpt, body: enBody },
        { locale: 'fr', title: frTitle, excerpt: frExcerpt, body: frBody },
      ],
      photos: newPhotos.map((p) => ({ url: p.url, alt: p.alt, caption: p.caption })),
    }
    if (type === 'listing') {
      draft.listing = {
        price: price ? Number(price) : null,
        currency: currency || 'XAF',
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        whatsappNumber: whatsappNumber.trim() || null,
        sellerName: sellerName.trim() || null,
      }
    }
    if (type === 'notice') {
      draft.notice = {
        noticeType,
        organizationName: organization.trim() || null,
        contactPhone: contactPhone.trim() || null,
        isOfficial: verification === 'official_source' || isOfficial,
        noticeDate: noticeDate ? new Date(noticeDate).toISOString() : null,
        expiryDate: noticeExpiry ? new Date(noticeExpiry).toISOString() : expiresAt ? new Date(expiresAt).toISOString() : null,
      }
    }
    if (type === 'culture') {
      draft.event = {
        startsAt: eventStartsAt ? new Date(eventStartsAt).toISOString() : null,
        endsAt: eventEndsAt ? new Date(eventEndsAt).toISOString() : null,
        venueName: venueName.trim() || null,
        ticketUrl: ticketUrl.trim() || null,
        organizerName: organizerName.trim() || null,
        organizerPhone: organizerPhone.trim() || null,
        organizerEmail: organizerEmail.trim() || null,
      }
    }

    const toast =
      publish === 'now' ? copy.toastPublished : publish === 'schedule' ? copy.toastScheduled : copy.toastCreated ?? copy.toastPublished
    const ok = await run(
      () =>
        createContentItem({
          type,
          draft,
          publish,
          scheduledFor: publish === 'schedule' ? new Date(scheduledFor).toISOString() : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      toast,
    )
    if (ok) {
      reset()
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
        {copy.newContent}
      </button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.newContentTitle}</DialogTitle>
            <p className="text-sm text-muted-foreground">{copy.newContentBody}</p>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-3">
            <Field label={copy.type}>
              <select value={type} onChange={(e) => { setType(e.target.value as never); setCategoryId('') }} className={inputCls}>
                {CONTENT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {typeFilters[ct as keyof TypeFilters] ?? ct}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={copy.enTitle}>
              <input value={enTitle} onChange={(e) => setEnTitle(e.target.value)} className={inputCls} required />
            </Field>
            <Field label={copy.frTitle} hint={publish !== 'draft' ? copy.bilingualHint : undefined}>
              <input value={frTitle} onChange={(e) => setFrTitle(e.target.value)} className={inputCls} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.enExcerpt}>
                <textarea value={enExcerpt} onChange={(e) => setEnExcerpt(e.target.value)} rows={2} className={inputCls} />
              </Field>
              <Field label={copy.frExcerpt}>
                <textarea value={frExcerpt} onChange={(e) => setFrExcerpt(e.target.value)} rows={2} className={inputCls} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.enBody}>
                <textarea value={enBody} onChange={(e) => setEnBody(e.target.value)} rows={4} className={inputCls} />
              </Field>
              <Field label={copy.frBody}>
                <textarea value={frBody} onChange={(e) => setFrBody(e.target.value)} rows={4} className={inputCls} />
              </Field>
            </div>
            <MediaUploader
              newPhotos={newPhotos}
              keepIds={[]}
              onChange={({ newPhotos: np }) => setNewPhotos(np)}
              destination="admin_asset"
              pickerCopy={{
                title: common.mediaLibrary,
                search: common.mediaLibrary,
                searchPlaceholder: common.mediaSearchPlaceholder,
                noResults: common.mediaNoResults,
                loading: common.mediaLoading,
                cancel: common.mediaCancel,
                select: common.mediaSelect,
                images: common.mediaImages,
                all: common.mediaAll,
                reuse: common.mediaReuse,
              }}
              copy={{
                label: copy.photosLabel,
                hint: copy.photosHint,
                browseFiles: common.browseFiles,
                dropHere: common.dropHere,
                or: common.orPasteUrl,
                urlPlaceholder: 'https://…',
                addUrl: common.addUrl,
                existing: copy.photosExisting,
                altLabel: common.altLabel,
                captionLabel: common.captionLabel,
                creditLabel: copy.photographerCredit,
                cover: common.cover,
                setCover: common.setCover,
                uploading: common.photoUploading,
                uploadError: common.photoUploadError,
                tooLarge: common.photoTooLarge,
                wrongType: common.photoWrongType,
                empty: common.noPhotos,
              }}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.photographerCredit}>
                <input value={credit} onChange={(e) => setCredit(e.target.value)} className={inputCls} />
              </Field>
              <Field label={copy.verificationLabel}>
                <select value={verification} onChange={(e) => setVerification(e.target.value)} className={inputCls}>
                  <option value="verified">{copy.verificationVerified}</option>
                  <option value="community_submission">{copy.verificationCommunity}</option>
                  <option value="official_source">{copy.verificationOfficial}</option>
                  <option value="developing">{copy.verificationDeveloping}</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.locationLabel}>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={copy.categoryLabel}>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {type === 'listing' && (
              <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <Field label={copy.priceLabel}>
                  <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.currencyLabel}>
                  <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className={inputCls} />
                </Field>
                <Field label={copy.sellerName}>
                  <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.contactPhone}>
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.contactEmail}>
                  <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.whatsappNumber}>
                  <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}

            {type === 'notice' && (
              <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <Field label={copy.noticeTypeLabel}>
                  <select value={noticeType} onChange={(e) => setNoticeType(e.target.value)} className={inputCls}>
                    {Object.entries(copy.noticeTypes).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label={copy.organization}>
                  <input value={organization} onChange={(e) => setOrganization(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.noticeDate}>
                  <input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.expiryDate}>
                  <input type="date" value={noticeExpiry} onChange={(e) => setNoticeExpiry(e.target.value)} className={inputCls} />
                </Field>
                <label className="flex items-center gap-2 text-sm pt-5">
                  <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
                  {copy.isOfficial}
                </label>
              </div>
            )}

            {type === 'culture' && (
              <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <Field label={copy.eventStartsAt}>
                  <input type="datetime-local" value={eventStartsAt} onChange={(e) => setEventStartsAt(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.eventEndsAt}>
                  <input type="datetime-local" value={eventEndsAt} onChange={(e) => setEventEndsAt(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.venueName}>
                  <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.ticketUrl}>
                  <input value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} className={inputCls} placeholder="https://" />
                </Field>
                <Field label={copy.organizerName}>
                  <input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.organizerPhone}>
                  <input value={organizerPhone} onChange={(e) => setOrganizerPhone(e.target.value)} className={inputCls} />
                </Field>
                <Field label={copy.organizerEmail} hint={undefined}>
                  <input value={organizerEmail} onChange={(e) => setOrganizerEmail(e.target.value)} className={inputCls} placeholder="name@example.com" />
                </Field>
              </div>
            )}

            <div className="grid gap-3 rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap gap-2">
                {(['now', 'schedule', 'draft'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPublish(mode)}
                    className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                      publish === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'now' ? copy.publishNow : mode === 'schedule' ? copy.publishSchedule : copy.publishDraft}
                  </button>
                ))}
              </div>
              {publish === 'schedule' && (
                <Field label={copy.scheduledFor}>
                  <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} required className={inputCls} />
                </Field>
              )}
              <Field label={`${copy.expiresAt} (${copy.optional})`}>
                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <DialogFooter>
              <button type="button" onClick={() => { reset(); setOpen(false) }} className={btnGhost} disabled={loading}>
                {common.cancel}
              </button>
              <button type="submit" className={btnPrimary} disabled={loading || !enTitle.trim()}>
                {loading ? common.working : publish === 'now' ? copy.createPublish : publish === 'schedule' ? copy.createSchedule : copy.createDraft}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ContentEditTrigger({
  content,
  copy,
  common,
  locations,
  categoriesByType,
  autoOpen = false,
}: {
  content: ContentRow
  copy: Copy
  common: CommonCopy
  locations: Option[]
  categoriesByType: Record<string, Option[]>
  /** Deep-link: pass `autoOpen` to open the dialog on page load (the content
   *  page derives it from the `edit` query param). */
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(autoOpen)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchEditData>> | null>(null)
  const [fetching, setFetching] = useState(false)

  // Data fetch on dialog open — mirrors moderation review pattern.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFetching(true)
    fetchEditData(content.id)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .finally(() => {
        if (!cancelled) setFetching(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, content.id])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnGhost}>
        {copy.editContent}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.editContent}</DialogTitle>
          </DialogHeader>
          {fetching ? (
            <p className="text-sm text-muted-foreground">{common.working}</p>
          ) : data ? (
            <ContentEditForm
              data={data}
              copy={copy}
              common={common}
              locations={locations}
              categories={categoriesByType[data.type] ?? []}
              onDone={() => setOpen(false)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ContentEditForm({
  data,
  copy,
  common,
  locations,
  categories,
  onDone,
}: {
  data: NonNullable<Awaited<ReturnType<typeof fetchEditData>>>
  copy: Copy
  common: CommonCopy
  locations: Option[]
  categories: Option[]
  onDone: () => void
}) {
  const { run, loading } = useAdminMutation()

  const [enTitle, setEnTitle] = useState(data.enTitle ?? '')
  const [frTitle, setFrTitle] = useState(data.frTitle ?? '')
  const [enExcerpt, setEnExcerpt] = useState(data.enExcerpt ?? '')
  const [frExcerpt, setFrExcerpt] = useState(data.frExcerpt ?? '')
  const [enBody, setEnBody] = useState(data.enBody ?? '')
  const [frBody, setFrBody] = useState(data.frBody ?? '')
  const [keepIds, setKeepIds] = useState<string[]>(data.photos.map((p) => p.id))
  const [newPhotos, setNewPhotos] = useState<UploadedPhoto[]>([])
  const [credit, setCredit] = useState('')
  const [verification, setVerification] = useState(data.verification ?? 'community_submission')
  const [locationId, setLocationId] = useState(data.locationId ?? '')
  const [categoryId, setCategoryId] = useState(data.categoryId ?? '')

  const isListing = data.type === 'listing'
  const isNotice = data.type === 'notice'
  const isCulture = data.type === 'culture'

  const [price, setPrice] = useState(data.listing?.price != null ? String(data.listing.price) : '')
  const [currency, setCurrency] = useState(data.listing?.currency ?? 'XAF')
  const [sellerName, setSellerName] = useState(data.listing?.sellerName ?? '')
  const [contactPhone, setContactPhone] = useState(data.listing?.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(data.listing?.contactEmail ?? '')
  const [whatsappNumber, setWhatsappNumber] = useState(data.listing?.whatsappNumber ?? '')
  const [noticeType, setNoticeType] = useState(data.notice?.noticeType ?? 'other')
  const [organization, setOrganization] = useState(data.notice?.organizationName ?? '')
  const [noticeDate, setNoticeDate] = useState(data.notice?.noticeDate ? data.notice.noticeDate.slice(0, 10) : '')
  const [noticeExpiry, setNoticeExpiry] = useState(data.notice?.expiryDate ? data.notice.expiryDate.slice(0, 10) : '')
  const [isOfficial, setIsOfficial] = useState(!!data.notice?.isOfficial)

  const [eventStartsAt, setEventStartsAt] = useState(data.event?.startsAt ? data.event.startsAt.slice(0, 16) : '')
  const [eventEndsAt, setEventEndsAt] = useState(data.event?.endsAt ? data.event.endsAt.slice(0, 16) : '')
  const [venueName, setVenueName] = useState(data.event?.venueName ?? '')
  const [ticketUrl, setTicketUrl] = useState(data.event?.ticketUrl ?? '')
  const [organizerName, setOrganizerName] = useState(data.event?.organizerName ?? '')
  const [organizerPhone, setOrganizerPhone] = useState(data.event?.organizerPhone ?? '')
  const [organizerEmail, setOrganizerEmail] = useState(data.event?.organizerEmail ?? '')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const draft: Parameters<typeof saveContentItem>[1] = {
      slugBase: enTitle.trim() || data.slug || data.type,
      verification: (verification || null) as never,
      locationId: locationId || null,
      categoryId: categoryId || null,
      photographerCredit: credit.trim() || null,
      translations: [
        { locale: 'en', title: enTitle, excerpt: enExcerpt, body: enBody },
        { locale: 'fr', title: frTitle, excerpt: frExcerpt, body: frBody },
      ],
      photos: newPhotos.map((p) => ({ url: p.url, alt: p.alt, caption: p.caption })),
      keepPhotoIds: keepIds,
    }
    if (isListing) {
      draft.listing = {
        price: price ? Number(price) : null,
        currency: currency || 'XAF',
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        whatsappNumber: whatsappNumber.trim() || null,
        sellerName: sellerName.trim() || null,
      }
    }
    if (isNotice) {
      draft.notice = {
        noticeType,
        organizationName: organization.trim() || null,
        contactPhone: contactPhone.trim() || null,
        isOfficial: verification === 'official_source' || isOfficial,
        noticeDate: noticeDate ? new Date(noticeDate).toISOString() : null,
        expiryDate: noticeExpiry ? new Date(noticeExpiry).toISOString() : null,
      }
    }
    if (isCulture) {
      draft.event = {
        startsAt: eventStartsAt ? new Date(eventStartsAt).toISOString() : null,
        endsAt: eventEndsAt ? new Date(eventEndsAt).toISOString() : null,
        venueName: venueName.trim() || null,
        ticketUrl: ticketUrl.trim() || null,
        organizerName: organizerName.trim() || null,
        organizerPhone: organizerPhone.trim() || null,
        organizerEmail: organizerEmail.trim() || null,
      }
    }

    const ok = await run(() => saveContentItem(data.id, draft), copy.toastUpdated ?? 'Saved.')
    if (ok) onDone()
  }

  return (
    <form onSubmit={handleSave} className="grid gap-3">
      <Field label={copy.enTitle}>
        <input value={enTitle} onChange={(e) => setEnTitle(e.target.value)} className={inputCls} required />
      </Field>
      <Field label={copy.frTitle} hint={copy.bilingualHint}>
        <input value={frTitle} onChange={(e) => setFrTitle(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.enExcerpt}>
          <textarea value={enExcerpt} onChange={(e) => setEnExcerpt(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <Field label={copy.frExcerpt}>
          <textarea value={frExcerpt} onChange={(e) => setFrExcerpt(e.target.value)} rows={2} className={inputCls} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.enBody}>
          <textarea value={enBody} onChange={(e) => setEnBody(e.target.value)} rows={4} className={inputCls} />
        </Field>
        <Field label={copy.frBody}>
          <textarea value={frBody} onChange={(e) => setFrBody(e.target.value)} rows={4} className={inputCls} />
        </Field>
      </div>

      <MediaUploader
        existingPhotos={data.photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt, caption: p.caption, credit: p.credit, isCover: false }))}
        keepIds={keepIds}
        newPhotos={newPhotos}
        onChange={({ keepIds: ki, newPhotos: np }) => { setKeepIds(ki); setNewPhotos(np) }}
        contentItemId={data.id}
        destination="admin_asset"
        pickerCopy={{
          title: common.mediaLibrary,
          search: common.mediaLibrary,
          searchPlaceholder: common.mediaSearchPlaceholder,
          noResults: common.mediaNoResults,
          loading: common.mediaLoading,
          cancel: common.mediaCancel,
          select: common.mediaSelect,
          images: common.mediaImages,
          all: common.mediaAll,
          reuse: common.mediaReuse,
        }}
        copy={{
          label: copy.photosLabel,
          hint: copy.photosHint,
          browseFiles: common.browseFiles,
          dropHere: common.dropHere,
          or: common.orPasteUrl,
          urlPlaceholder: 'https://…',
          addUrl: common.addUrl,
          existing: copy.photosExisting,
          altLabel: common.altLabel,
          captionLabel: common.captionLabel,
          creditLabel: copy.photographerCredit,
          cover: common.cover,
          setCover: common.setCover,
          uploading: common.photoUploading,
          uploadError: common.photoUploadError,
          tooLarge: common.photoTooLarge,
          wrongType: common.photoWrongType,
          empty: common.noPhotos,
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.photographerCredit}>
          <input value={credit} onChange={(e) => setCredit(e.target.value)} className={inputCls} />
        </Field>
        <Field label={copy.verificationLabel}>
          <select value={verification} onChange={(e) => setVerification(e.target.value)} className={inputCls}>
            <option value="verified">{copy.verificationVerified}</option>
            <option value="community_submission">{copy.verificationCommunity}</option>
            <option value="official_source">{copy.verificationOfficial}</option>
            <option value="developing">{copy.verificationDeveloping}</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.locationLabel}>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.categoryLabel}>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {isListing && (
        <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <Field label={copy.priceLabel}>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.currencyLabel}>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className={inputCls} />
          </Field>
          <Field label={copy.sellerName}>
            <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.contactPhone}>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.contactEmail}>
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.whatsappNumber}>
            <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}

      {isNotice && (
        <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <Field label={copy.noticeTypeLabel}>
            <select value={noticeType} onChange={(e) => setNoticeType(e.target.value)} className={inputCls}>
              {Object.entries(copy.noticeTypes).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label={copy.organization}>
            <input value={organization} onChange={(e) => setOrganization(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.noticeDate}>
            <input type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.expiryDate}>
            <input type="date" value={noticeExpiry} onChange={(e) => setNoticeExpiry(e.target.value)} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm pt-5">
            <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
            {copy.isOfficial}
          </label>
        </div>
      )}

      {isCulture && (
        <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
          <Field label={copy.eventStartsAt}>
            <input type="datetime-local" value={eventStartsAt} onChange={(e) => setEventStartsAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.eventEndsAt}>
            <input type="datetime-local" value={eventEndsAt} onChange={(e) => setEventEndsAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.venueName}>
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.ticketUrl}>
            <input value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} className={inputCls} placeholder="https://" />
          </Field>
          <Field label={copy.organizerName}>
            <input value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.organizerPhone}>
            <input value={organizerPhone} onChange={(e) => setOrganizerPhone(e.target.value)} className={inputCls} />
          </Field>
          <Field label={copy.organizerEmail}>
            <input value={organizerEmail} onChange={(e) => setOrganizerEmail(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}

      <DialogFooter>
        <button type="button" onClick={onDone} className={btnGhost} disabled={loading}>
          {common.cancel}
        </button>
        <button type="submit" className={btnPrimary} disabled={loading || !enTitle.trim()}>
          {loading ? common.working : copy.save}
        </button>
      </DialogFooter>
    </form>
  )
}

export function ContentDeleteButton({
  content,
  copy,
  common,
}: {
  content: ContentRow
  copy: Copy
  common: CommonCopy
}) {
  const { run, loading } = useAdminMutation()
  const [open, setOpen] = useState(false)

  async function handleDelete() {
    const ok = await run(() => deleteContentItem(content.id), copy.toastDeleted ?? 'Deleted.')
    if (ok) setOpen(false)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={loading} className={btnDanger} title={copy.deleteHint}>
        {copy.delete}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.deleteConfirmTitle.replace('{title}', content.title ?? content.slug ?? content.id.slice(0, 8))}
        description={copy.deleteConfirmBody}
        confirmLabel={copy.delete}
        cancelLabel={common.cancel}
        loading={loading}
        onConfirm={handleDelete}
      />
    </>
  )
}

'use client'

import { useState } from 'react'
import {
  approveSubmissionWithContent,
  rejectSubmission,
  updateSubmissionNotes,
  requestClarification,
  reopenSubmission,
} from '@/lib/admin/actions'
import type { ContentDraftInput } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { SubmissionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['review']
type Option = { id: string; name: string }

/** Payload prefill: map the submit-form payload keys onto the drawer fields. */
function prefillFromPayload(payload: Record<string, unknown> | null) {
  const p = payload ?? {}
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    title: str(p.headline) || str(p.item) || str(p.what),
    body: str(p.description) || str(p.message),
    price: str(p.price),
    photos: str(p.photos),
    organization: str(p.organization),
    noticeType: str(p.noticeType),
  }
}

/**
 * Review screen actions (Phase 3): internal notes, the approve-with-content
 * drawer (create the real content item — bilingual titles, photos, listing /
 * notice fields, publish mode), reject with reason, request clarification
 * and reopen. The legacy bare approve lives on the queue list for quick
 * triage only.
 */
export function ReviewActions({
  submission,
  copy,
  locations = [],
  categories = [],
}: {
  submission: SubmissionRow
  copy: Copy
  locations?: Option[]
  categories?: Option[]
}) {
  const { addToast } = useToast()
  const [notes, setNotes] = useState(submission.internalNotes ?? '')
  const [notesBusy, setNotesBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [clarifyOpen, setClarifyOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const prefill = prefillFromPayload(submission.payload)
  const isListing = submission.submissionType === 'buy_sell'
  const isNotice = submission.submissionType === 'notice'

  const actionable =
    submission.status === 'pending' || submission.status === 'in_review' || submission.status === 'needs_clarification'
  const hasContentItem = !!submission.contentItemId

  async function handleSaveNotes() {
    setNotesBusy(true)
    const result = await updateSubmissionNotes(submission.id, notes)
    setNotesBusy(false)
    if (result.ok) addToast(copy.toastNotesSaved, 'success')
    else addToast(result.error, 'error')
  }

  async function handleReject() {
    if (!reason.trim()) return
    setBusy(true)
    const result = await rejectSubmission(submission.id, reason)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastRejected, 'success')
      setRejectOpen(false)
      setReason('')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleClarify() {
    if (!question.trim()) return
    setBusy(true)
    const result = await requestClarification(submission.id, question)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastClarified, 'success')
      setClarifyOpen(false)
      setQuestion('')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleReopen() {
    setBusy(true)
    const result = await reopenSubmission(submission.id)
    setBusy(false)
    if (result.ok) addToast(copy.toastReopened, 'success')
    else addToast(result.error, 'error')
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{copy.notes}</h2>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={copy.notesPlaceholder}
        rows={4}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={handleSaveNotes}
        disabled={notesBusy}
        className="mt-2 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {copy.saveNotes}
      </button>

      {actionable && !hasContentItem && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          disabled={busy}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {copy.approveWithContent}
        </button>
      )}

      {actionable && (
        <div className="mt-2 flex flex-col gap-2">
          {clarifyOpen ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-xs text-muted-foreground">{copy.clarifyBody}</p>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={copy.clarifyPlaceholder}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setClarifyOpen(false); setQuestion('') }}
                  disabled={busy}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleClarify}
                  disabled={busy || !question.trim()}
                  className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {copy.clarify}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setClarifyOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:border-amber-400 hover:text-foreground transition-colors"
            >
              {copy.clarify}
            </button>
          )}

          {rejectOpen ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-background p-3">
              <p className="text-xs text-muted-foreground">{copy.rejectBody}</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={copy.rejectPlaceholder}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setRejectOpen(false); setReason('') }}
                  disabled={busy}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={busy || !reason.trim()}
                  className="inline-flex items-center rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {copy.reject}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
            >
              {copy.reject}
            </button>
          )}
        </div>
      )}

      {!actionable && (
        <button
          type="button"
          onClick={handleReopen}
          disabled={busy}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {copy.reopen}
        </button>
      )}

      {drawerOpen && (
        <ApproveDrawer
          submission={submission}
          copy={copy}
          locations={locations}
          categories={categories}
          prefill={prefill}
          isListing={isListing}
          isNotice={isNotice}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Approve-with-content drawer                                          */
/* ------------------------------------------------------------------ */

const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

function ApproveDrawer({
  submission,
  copy,
  locations,
  categories,
  prefill,
  isListing,
  isNotice,
  onClose,
}: {
  submission: SubmissionRow
  copy: Copy
  locations: Option[]
  categories: Option[]
  prefill: ReturnType<typeof prefillFromPayload>
  isListing: boolean
  isNotice: boolean
  onClose: () => void
}) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [publish, setPublish] = useState<'now' | 'schedule' | 'draft'>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [enTitle, setEnTitle] = useState(prefill.title)
  const [frTitle, setFrTitle] = useState('')
  const [enExcerpt, setEnExcerpt] = useState('')
  const [frExcerpt, setFrExcerpt] = useState('')
  const [enBody, setEnBody] = useState(prefill.body)
  const [frBody, setFrBody] = useState('')
  const [photos, setPhotos] = useState(prefill.photos)
  const [credit, setCredit] = useState('')
  const [verification, setVerification] = useState('community_submission')
  const [locationId, setLocationId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState(prefill.price)
  const [currency, setCurrency] = useState('XAF')
  const [sellerName, setSellerName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [noticeType, setNoticeType] = useState(prefill.noticeType || 'other')
  const [organization, setOrganization] = useState(prefill.organization)

  async function handleApprove() {
    setBusy(true)
    const draft: ContentDraftInput = {
      slugBase: enTitle.trim() || 'submission',
      verification: (verification || null) as ContentDraftInput['verification'],
      locationId: locationId || null,
      categoryId: categoryId || null,
      photographerCredit: credit.trim() || null,
      translations: [
        { locale: 'en', title: enTitle, excerpt: enExcerpt, body: enBody },
        { locale: 'fr', title: frTitle, excerpt: frExcerpt, body: frBody },
      ],
      photos: photos
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((url) => ({ url })),
    }
    if (isListing) {
      draft.listing = {
        price: price ? Number(price) : null,
        currency: currency || 'XAF',
        contactPhone: contactPhone.trim() || null,
        sellerName: sellerName.trim() || null,
      }
    }
    if (isNotice) {
      draft.notice = {
        noticeType,
        organizationName: organization.trim() || null,
        isOfficial: verification === 'official_source',
      }
    }
    const result = await approveSubmissionWithContent({
      submissionId: submission.id,
      draft,
      publish,
      scheduledFor: publish === 'schedule' ? new Date(scheduledFor).toISOString() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    setBusy(false)
    if (result.ok) {
      addToast(
        publish === 'now' ? copy.toastPublished : publish === 'schedule' ? copy.toastScheduled : copy.draftCreated,
        'success',
      )
      onClose()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="relative z-10 my-8 w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold">{copy.createContentTitle}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{copy.createContentBody}</p>

        <div className="mt-4 grid gap-3">
          <Field label={copy.enTitle}>
            <input value={enTitle} onChange={(e) => setEnTitle(e.target.value)} className={inputCls} />
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
          <Field label={copy.photosLabel} hint={copy.photosHint}>
            <textarea value={photos} onChange={(e) => setPhotos(e.target.value)} rows={3} className={inputCls} />
          </Field>
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
          {locations.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.locationLabel}>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </Field>
              {categories.length > 0 && (
                <Field label={copy.categoryLabel}>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}
          {isListing && (
            <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-2">
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
            </div>
          )}
          {isNotice && (
            <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-2">
              <Field label={copy.noticeTypeLabel}>
                <select value={noticeType} onChange={(e) => setNoticeType(e.target.value)} className={inputCls}>
                  <option value="public_notice">Public notice</option>
                  <option value="lost_found">Lost &amp; found</option>
                  <option value="road_closure">Road closure</option>
                  <option value="community_alert">Community alert</option>
                  <option value="missing_person">Missing person</option>
                  <option value="service_announcement">Service announcement</option>
                  <option value="government_notice">Government notice</option>
                  <option value="school_notice">School notice</option>
                  <option value="organization_notice">Organization notice</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label={copy.organization}>
                <input value={organization} onChange={(e) => setOrganization(e.target.value)} className={inputCls} />
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
                <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={inputCls} />
              </Field>
            )}
            <Field label={`${copy.expiresAt} (${copy.optional})`}>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy || !enTitle.trim()}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {busy ? '…' : copy.approveWithContent}
          </button>
        </div>
      </div>
    </div>
  )
}

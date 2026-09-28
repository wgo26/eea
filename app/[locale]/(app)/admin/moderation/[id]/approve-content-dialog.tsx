'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogMaximizeToggle, DialogTabSwitcher } from '@/components/admin/dialog-maximize-toggle'
import { ContentForm, type FormValues } from '../../content/content-form'
import { prefillFromSubmission } from '@/lib/content/submission-prefill'
import { contentTypeForSubmission } from '@/lib/content/submission-types'
import type { Dictionary } from '@/lib/i18n'
import type { SubmissionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['review']
type ContentCopy = Dictionary['admin']['content']
type CommonCopy = Dictionary['admin']['common']
type TypeFilters = Dictionary['admin']['typeFilters']
type Option = { id: string; name: string; slug?: string }

/**
 * The approve dialog: the *same* ContentForm the Content screen uses, in
 * `mode="approve"`, seeded from the submission payload.
 *
 * This replaced a hand-written 640-line drawer that had drifted to about half
 * the fields of the form beside it — no story blocks, tags, slug, SEO, byline,
 * share line, event fields, per-photo alt/caption, media library, preview,
 * autosave or intelligence layer. A post approved from the queue was therefore
 * a lesser artifact than one created in Content, and finishing it meant opening
 * the edit drawer anyway. Approving now *is* editing, in one place.
 */
export function ApproveContentDialog({
  submission,
  copy,
  contentCopy,
  common,
  typeFilters,
  locations,
  categories,
  onDone,
}: {
  submission: SubmissionRow
  copy: Copy
  contentCopy: ContentCopy
  common: CommonCopy
  typeFilters: TypeFilters
  locations: Option[]
  /** Categories for the content type this submission becomes. */
  categories: Option[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [tab, setTab] = useState<'editor' | 'preview'>('editor')

  const contentType = contentTypeForSubmission(submission.submissionType) ?? 'news'
  // Computed on open only: prefill reads the payload and nothing else, so a
  // reviewer who closes and reopens sees the same starting point, and the
  // autosave slot (keyed to the submission) owns any edits in between.
  const prefill = open
    ? prefillFromSubmission({
        payload: submission.payload,
        submissionType: submission.submissionType,
        locations,
        categories,
      })
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
      >
        {copy.approveWithContent}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          maximized={maximized}
          showCloseButton={false}
          className={maximized ? 'gap-4 overflow-y-auto p-6' : 'max-h-[90vh] overflow-y-auto sm:max-w-3xl'}
        >
          <DialogHeader className="sticky top-0 z-10 -mx-6 -mt-6 flex-row items-start justify-between gap-3 border-b border-border bg-popover px-6 pb-3 pt-4">
            <div className="min-w-0">
              <DialogTitle>{contentCopy.newContentTitle}</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{copy.createContentBody}</p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <DialogTabSwitcher tab={tab} onTabChange={setTab} labels={common} />
              <DialogMaximizeToggle maximized={maximized} onToggle={() => setMaximized((v) => !v)} labels={common} />
              <DialogClose
                render={
                  <button
                    type="button"
                    aria-label={common.close}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                }
              />
            </span>
          </DialogHeader>

          {open && prefill ? (
            <ContentForm
              mode="approve"
              copy={contentCopy}
              common={common}
              typeFilters={typeFilters}
              locations={locations}
              // The form keys categories off the *content* type it is creating.
              categoriesByType={{ [contentType]: categories }}
              tab={tab}
              approve={{
                submissionId: submission.id,
                prefill: {
                  ...prefill.values,
                  // The submitter's photos are the draft's photo list: the
                  // reviewer can drop, reorder, caption and cover-select them in
                  // the shared media uploader instead of re-pasting URLs.
                  newPhotos: prefill.photos.map((p) => ({ url: p.url, caption: p.caption })),
                } as Partial<FormValues>,
                unmapped: prefill.unmapped,
                submissionType: submission.submissionType,
              }}
              onDone={() => {
                setOpen(false)
                setTab('editor')
                onDone()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

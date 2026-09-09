'use client'

import { useState } from 'react'
import { resolveLegalReport, resolveDataRequest } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeRequestType } from '@/lib/admin/labels'
import { formatRelative } from '@/lib/admin/format'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { ReportRow, DataRequestRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['policies']

/**
 * Legal inbox: copyright takedowns (from /about/copyright) and data/contact
 * requests (from /about/privacy + /about/contact). Open items resolve here
 * with a note; history stays visible below.
 */
export function InboxLists({
  copy,
  common,
  takedowns,
  requests,
  locale,
}: {
  copy: Copy
  common: Dictionary['admin']['common']
  takedowns: ReportRow[]
  requests: DataRequestRow[]
  locale: Locale
}) {
  const openTakedowns = takedowns.filter((r) => r.status === 'open')
  const doneTakedowns = takedowns.filter((r) => r.status !== 'open')
  const openRequests = requests.filter((r) => r.status === 'open')
  const doneRequests = requests.filter((r) => r.status !== 'open')

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{copy.inboxBody}</p>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">
          {copy.inboxTakedowns} · {openTakedowns.length}
        </h2>
        {takedowns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {copy.emptyInbox}
          </p>
        ) : (
          <>
            {openTakedowns.map((report) => (
              <TakedownCard key={report.id} report={report} copy={copy} common={common} locale={locale} />
            ))}
            {doneTakedowns.map((report) => (
              <TakedownCard key={report.id} report={report} copy={copy} common={common} locale={locale} done />
            ))}
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">
          {copy.inboxRequests} · {openRequests.length}
        </h2>
        {requests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {copy.emptyInbox}
          </p>
        ) : (
          <>
            {openRequests.map((req) => (
              <RequestCard key={req.id} request={req} copy={copy} common={common} locale={locale} />
            ))}
            {doneRequests.map((req) => (
              <RequestCard key={req.id} request={req} copy={copy} common={common} locale={locale} done />
            ))}
          </>
        )}
      </section>
    </div>
  )
}

function ResolveBox({
  copy,
  onResolve,
}: {
  copy: Copy
  onResolve: (input: { resolution?: string; dismiss?: boolean }) => Promise<{ ok: boolean; error?: string }>
}) {
  const { addToast } = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function handle(dismiss: boolean) {
    setBusy(true)
    const result = await onResolve({ resolution: note, dismiss })
    setBusy(false)
    if (result.ok) addToast(dismiss ? copy.toastDismissed : copy.toastResolved, 'success')
    else if (result.error) addToast(result.error, 'error')
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <span>{copy.resolutionLabel}</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.resolutionPh}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handle(false)}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {copy.resolve}
        </button>
        <button
          type="button"
          onClick={() => handle(true)}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          {copy.dismiss}
        </button>
      </div>
    </div>
  )
}

function TakedownCard({
  report,
  copy,
  common,
  locale,
  done,
}: {
  report: ReportRow
  copy: Copy
  common: Dictionary['admin']['common']
  locale: Locale
  done?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={report.status} label={localizeStatus(report.status, common)} />
        <span className="text-sm font-medium">{report.subject ?? copy.takedownFallback}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {report.createdAt ? formatRelative(report.createdAt, locale) : null}
        </span>
      </div>
      {report.description ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {report.description}
        </p>
      ) : null}
      {report.evidenceUrl ? (
        <a
          href={report.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
        >
          {report.evidenceUrl}
        </a>
      ) : null}
      {report.resolution ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {copy.resolutionLabel}: {report.resolution}
        </p>
      ) : null}
      {!done ? (
        <ResolveBox copy={copy} onResolve={(input) => resolveLegalReport(report.id, input)} />
      ) : null}
    </div>
  )
}

function RequestCard({
  request,
  copy,
  common,
  locale,
  done,
}: {
  request: DataRequestRow
  copy: Copy
  common: Dictionary['admin']['common']
  locale: Locale
  done?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} label={localizeStatus(request.status, common)} />
        <span className="text-sm font-medium">{localizeRequestType(request.requestType, copy.requestTypes as unknown as Record<string, string>)}</span>
        {request.requesterEmail ? (
          <a
            href={`mailto:${request.requesterEmail}`}
            className="text-xs text-primary underline underline-offset-2"
          >
            {request.requesterEmail}
          </a>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {request.createdAt ? formatRelative(request.createdAt, locale) : null}
        </span>
      </div>
      {request.description ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {request.description}
        </p>
      ) : null}
      {request.resolution ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {copy.resolutionLabel}: {request.resolution}
        </p>
      ) : null}
      {!done ? (
        <ResolveBox copy={copy} onResolve={(input) => resolveDataRequest(request.id, input)} />
      ) : null}
    </div>
  )
}

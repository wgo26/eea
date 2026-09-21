'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTimelineEntryAction,
  deleteTimelineEntryAction,
  updateTimelineEntryAction,
} from '@/lib/admin/actions-timeline'
import type { TimelineEntry } from '@/lib/queries/timeline'
import { ui } from '@/lib/admin/ui-constants'

type TimelineCopy = {
  timelineEntryTitle: string
  timelineEntryBody: string
  timelineEntryTime: string
  timelinePublishNow: string
  timelineAdd: string
  timelineEmpty: string
  timelineDelete: string
  timelinePublish: string
  timelineUnpublish: string
  timelineSaved: string
  timelineFailed: string
}

/**
 * Phase 4 — editor UI for the Eagle Eye Timeline (Differentiator #6).
 * Appends timestamped updates to a developing story, toggles publish state
 * and deletes entries. All writes go through capability-checked server
 * actions in lib/admin/actions-timeline.ts.
 */
export function TimelineEditor({
  contentItemId,
  initialEntries,
  copy,
}: {
  contentItemId: string
  initialEntries: TimelineEntry[]
  copy: TimelineCopy
}) {
  const router = useRouter()
  const [entries, setEntries] = useState<TimelineEntry[]>(initialEntries)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [publishNow, setPublishNow] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function addEntry() {
    setSaving(true)
    setMessage(null)
    setError(null)
    const res = await createTimelineEntryAction({
      contentItemId,
      title,
      body,
      isPublished: publishNow,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error || copy.timelineFailed)
      return
    }
    setTitle('')
    setBody('')
    setMessage(copy.timelineSaved)
    router.refresh()
  }

  async function togglePublish(entry: TimelineEntry) {
    const res = await updateTimelineEntryAction(entry.id, {
      isPublished: !entry.isPublished,
    })
    if (!res.ok) {
      setError(res.error || copy.timelineFailed)
      return
    }
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, isPublished: !e.isPublished } : e)),
    )
    router.refresh()
  }

  async function removeEntry(entry: TimelineEntry) {
    const res = await deleteTimelineEntryAction(entry.id)
    if (!res.ok) {
      setError(res.error || copy.timelineFailed)
      return
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className={ui.card}>
        <div className="grid gap-3">
          <label className={ui.field}>
            <span className={ui.label}>{copy.timelineEntryTitle}</span>
            <input
              className={ui.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </label>
          <label className={ui.field}>
            <span className={ui.label}>{copy.timelineEntryBody}</span>
            <textarea
              className={ui.textarea}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
            />
            {copy.timelinePublishNow}
          </label>
          <div>
            <button
              type="button"
              className={ui.btnPrimary}
              disabled={saving || !title.trim() || !body.trim()}
              onClick={addEntry}
            >
              {copy.timelineAdd}
            </button>
          </div>
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.timelineEmpty}</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className={ui.card}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()} ·{' '}
                    {entry.isPublished ? '●' : '○'}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{entry.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.body}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className={ui.btnSecondary}
                    onClick={() => togglePublish(entry)}
                  >
                    {entry.isPublished ? copy.timelineUnpublish : copy.timelinePublish}
                  </button>
                  <button
                    type="button"
                    className={ui.btnDanger}
                    onClick={() => removeEntry(entry)}
                  >
                    {copy.timelineDelete}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

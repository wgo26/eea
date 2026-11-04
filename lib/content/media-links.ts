/**
 * The content editor's single "media links" field: one URL per line, optional
 * " - caption" suffix, media type inferred from the URL.
 *
 * It replaces three per-kind textareas (video / audio / document) that asked an
 * editor to classify a link the app already classifies by host and extension —
 * and only the video box counted toward the publish checklist, so the boxes
 * disagreed with how the public pages read the very same row.
 *
 * Pure and client- plus server-safe: the content form uses it both ways (rows →
 * text when the drawer opens, text → rows when it saves).
 */
import { parseMediaList } from '@/lib/media/attachments'

export type MediaLinkKind = 'video' | 'audio' | 'document' | 'image'

export type MediaLinkAttachment = {
  url: string
  kind: MediaLinkKind
  caption?: string
  /**
   * Id of the stored `media_assets` row this line already owns. Preserved so an
   * edit UPDATES that row instead of deleting and re-inserting it, and so
   * deleting a line deletes exactly the row it came from.
   */
  assetId?: string
}

/**
 * Media-links text → attachment rows. A line matching an existing row (by URL)
 * inherits that row's id; anything else is a new row.
 */
export function attachmentsFromMediaLinks(
  raw: string,
  existing?: { id: string; url: string }[],
): MediaLinkAttachment[] {
  return parseMediaList(raw).map((a) => ({
    url: a.url,
    kind: a.kind,
    caption: a.caption ?? undefined,
    assetId: existing?.find((e) => e.url === a.url)?.id,
  }))
}

/** Stored media rows → the field's text (the inverse of {@link attachmentsFromMediaLinks}). */
export function serializeMediaLinks(rows: { url: string; caption: string | null }[] | null | undefined): string {
  return (rows ?? [])
    .map((row) => (row.caption ? `${row.url} - ${row.caption}` : row.url))
    .join('\n')
}

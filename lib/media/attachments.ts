/**
 * Shared media-attachment model for Phase A+B.
 *
 * The DB (`media_assets`) already stores kind/mime/public_url, but every
 * public query selected only image fields. This module is the single place
 * that maps a raw `media_assets` row (or a pasted URL) to a renderable
 * attachment, so news / photo-stories / culture / notices / listings all
 * agree on what "has video" means.
 */

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

export type MediaAttachment = {
  url: string;
  kind: AttachmentKind;
  mimeType?: string | null;
  caption?: string | null;
  credit?: string | null;
  alt?: string | null;
};

type RawMediaRow = {
  public_url?: string | null;
  kind?: string | null;
  mime_type?: string | null;
  caption?: string | null;
  alt_text?: string | null;
  photographer_credit?: string | null;
};

const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'weba']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg']);
const DOC_EXT = new Set(['pdf']);

export function inferKindFromUrl(url: string): AttachmentKind {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  const ext = clean.split('.').pop() ?? '';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (DOC_EXT.has(ext)) return 'document';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (/youtube\.com|youtu\.be|vimeo\.com|soundcloud\.com|spotify\.com|audiomack\.com/i.test(url)) {
    return /soundcloud|spotify|audiomack/i.test(url) ? 'audio' : 'video';
  }
  return 'image';
}

export function inferKindFromMime(mime: string | null | undefined): AttachmentKind | null {
  if (!mime) return null;
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'document';
  return null;
}

/** Map a raw media_assets row to an attachment. DB kind wins, URL is fallback. */
export function toAttachment(row: RawMediaRow): MediaAttachment | null {
  const url = (row.public_url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const fromMime = inferKindFromMime(row.mime_type);
  const kind: AttachmentKind =
    row.kind === 'video' || row.kind === 'audio' || row.kind === 'document' || row.kind === 'image'
      ? row.kind
      : (fromMime ?? inferKindFromUrl(url));
  return {
    url,
    kind,
    mimeType: row.mime_type ?? null,
    caption: row.caption ?? null,
    credit: row.photographer_credit ?? null,
    alt: row.alt_text ?? null,
  };
}

export function mapAttachments(rows: RawMediaRow[] | null | undefined): MediaAttachment[] {
  return (rows ?? []).map(toAttachment).filter((a): a is MediaAttachment => a !== null);
}

export function supportingMedia(rows: MediaAttachment[]): MediaAttachment[] {
  return rows.filter((a) => a.kind === 'video' || a.kind === 'audio' || a.kind === 'document');
}

export function hasVideo(rows: MediaAttachment[] | RawMediaRow[] | null | undefined): boolean {
  if (!rows) return false;
  return rows.some((r) => {
    if ((r as MediaAttachment).kind) return (r as MediaAttachment).kind === 'video';
    const row = r as RawMediaRow;
    return row.kind === 'video' || inferKindFromMime(row.mime_type) === 'video' || (row.public_url ? inferKindFromUrl(row.public_url) === 'video' : false);
  });
}

export function hasAudio(rows: MediaAttachment[] | RawMediaRow[] | null | undefined): boolean {
  if (!rows) return false;
  return rows.some((r) => {
    if ((r as MediaAttachment).kind) return (r as MediaAttachment).kind === 'audio';
    const row = r as RawMediaRow;
    return row.kind === 'audio' || inferKindFromMime(row.mime_type) === 'audio' || (row.public_url ? inferKindFromUrl(row.public_url) === 'audio' : false);
  });
}

/**
 * Parse a newline-separated URL list (the public intake format:
 * one URL per line, optional " - caption" suffix) into attachments.
 */
export function parseMediaList(value: string | null | undefined): MediaAttachment[] {
  if (!value) return [];
  const out: MediaAttachment[] = [];
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [urlPart, ...captionParts] = trimmed.split(/\s+-\s+/);
    const url = (urlPart ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const caption = captionParts.join(' - ').trim() || null;
    out.push({ url, kind: inferKindFromUrl(url), caption });
  }
  return out;
}

/** Serialize attachments back to the intake textarea format. */
export function serializeMediaList(items: MediaAttachment[]): string {
  return items
    .map((a) => (a.caption ? `${a.url} - ${a.caption}` : a.url))
    .join('\n');
}

/** Format a duration in seconds as m:ss or h:mm:ss for moderation UI. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

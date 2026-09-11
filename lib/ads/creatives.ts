/**
 * Shared ad-creative model (masterpiece ads).
 *
 * One campaign = one creative in exactly one format, with separate
 * mobile/desktop file assets so the same slot renders well at 320px and at
 * 1280px. HTML creatives are third-party snippets rendered in a sandboxed
 * iframe — sanitized on save (this module) and scriptless at render.
 */

import { sanitizeHtml } from '@/lib/security/html'

export const AD_FORMATS = ['image', 'video', 'audio', 'html', 'sponsored'] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export function isAdFormat(value: string | null | undefined): value is AdFormat {
  return typeof value === 'string' && (AD_FORMATS as readonly string[]).includes(value);
}

export function isHttpsUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim());
}

const MAX_HTML_CHARS = 20000;

/**
 * Server-side sanitizer for `creative_html` (mirrors the DB length check).
 * Delegates active-content stripping to the shared sanitizer
 * (lib/security/html.ts) and adds the ad-specific policy: null when nothing
 * safe remains or when the snippet is plain text (the sponsored/text format
 * covers that). Inline CSS and static markup survive; interactivity is
 * intentionally unsupported (the render iframe carries no `allow-scripts`
 * either, so this is defense in depth).
 */
export function sanitizeCreativeHtml(raw: string | null | undefined): string | null {
  const html = sanitizeHtml(raw, MAX_HTML_CHARS);
  if (html === null) return null;
  // Plain text without any tag is not an HTML creative — the sponsored/text
  // format covers that (prevents storing "hello" as html).
  if (!/<[a-z][^>]*>/i.test(html)) return null;
  return html;
}

export type CreativeValidationInput = {
  format: AdFormat;
  /** Slot constraints (null = unconstrained). */
  allowedFormats?: string[] | null;
  maxDurationSeconds?: number | null;
  desktopUrl?: string | null;
  mobileUrl?: string | null;
  posterUrl?: string | null;
  html?: string | null;
  /** Known playback duration (media_assets.duration_seconds). */
  durationSeconds?: number | null;
  destinationUrl?: string | null;
};

/**
 * Validate a campaign creative against its slot. Returns the error string or
 * null when valid. Pure — shared by admin actions and unit tests.
 */
export function validateCreative(input: CreativeValidationInput): string | null {
  const { format } = input;
  if (input.allowedFormats && input.allowedFormats.length > 0 && !input.allowedFormats.includes(format)) {
    return `This slot does not accept the "${format}" format.`;
  }
  if (input.destinationUrl && !isHttpsUrl(input.destinationUrl)) {
    return 'Ad destination must use https://.';
  }
  switch (format) {
    case 'sponsored':
      return null;
    case 'html':
      if (!input.html || !sanitizeCreativeHtml(input.html)) {
        return 'HTML creatives need safe markup (scripts and event handlers are stripped).';
      }
      return null;
    case 'image':
      if (!input.desktopUrl && !input.mobileUrl) return 'Image creatives need a desktop and/or mobile image.';
      if (input.desktopUrl && !isHttpsUrl(input.desktopUrl)) return 'Desktop image must be an https:// URL.';
      if (input.mobileUrl && !isHttpsUrl(input.mobileUrl)) return 'Mobile image must be an https:// URL.';
      if (input.posterUrl && !isHttpsUrl(input.posterUrl)) return 'Poster must be an https:// URL.';
      return null;
    case 'video':
      if (!input.desktopUrl && !input.mobileUrl) return 'Video creatives need a desktop and/or mobile video file.';
      if (input.desktopUrl && !isHttpsUrl(input.desktopUrl)) return 'Desktop video must be an https:// URL.';
      if (input.mobileUrl && !isHttpsUrl(input.mobileUrl)) return 'Mobile video must be an https:// URL.';
      if (input.durationSeconds != null && input.maxDurationSeconds != null && input.durationSeconds > input.maxDurationSeconds) {
        return `This video is too long for the slot (max ${input.maxDurationSeconds}s).`;
      }
      return null;
    case 'audio':
      if (!input.desktopUrl) return 'Audio creatives need an audio file.';
      if (!isHttpsUrl(input.desktopUrl)) return 'Audio file must be an https:// URL.';
      if (input.durationSeconds != null && input.maxDurationSeconds != null && input.durationSeconds > input.maxDurationSeconds) {
        return `This audio is too long for the slot (max ${input.maxDurationSeconds}s).`;
      }
      return null;
  }
}

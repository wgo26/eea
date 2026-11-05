import { describe, expect, it } from 'vitest';
import { coverRow, formatDuration, hasVideoMedia, inferKindFromUrl, mapAttachments, parseMediaList, previewImageUrl, resolveDisplayImage, supportingMedia, videoThumbnailUrl, youtubeIdFromUrl } from './attachments';

describe('media attachments', () => {
  it('infers video/audio from extensions', () => {
    expect(inferKindFromUrl('https://x/y.mp4')).toBe('video');
    expect(inferKindFromUrl('https://x/y.webm')).toBe('video');
    expect(inferKindFromUrl('https://x/y.mp3')).toBe('audio');
    expect(inferKindFromUrl('https://x/y.wav')).toBe('audio');
    expect(inferKindFromUrl('https://x/y.pdf')).toBe('document');
    expect(inferKindFromUrl('https://x/y.jpg')).toBe('image');
  });

  it('infers hosted players', () => {
    expect(inferKindFromUrl('https://www.youtube.com/watch?v=abc123')).toBe('video');
    expect(inferKindFromUrl('https://soundcloud.com/x/y')).toBe('audio');
  });

  it('parses newline lists with captions', () => {
    const items = parseMediaList('https://x/a.mp4 - A clip\nhttps://x/b.mp3\nnot-a-url');
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('video');
    expect(items[0].caption).toBe('A clip');
    expect(items[1].kind).toBe('audio');
  });

  it('maps DB rows preferring kind then mime then URL', () => {
    const all = mapAttachments([
      { public_url: 'https://x/a.jpg', kind: 'image' },
      { public_url: 'https://x/b.mp4', kind: null, mime_type: 'video/mp4' },
      { public_url: 'not-a-url', kind: 'video' },
    ]);
    expect(all).toHaveLength(2);
    expect(supportingMedia(all)).toHaveLength(1);
    expect(supportingMedia(all)[0].kind).toBe('video');
  });

  it('formats durations for moderation UI', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('extracts YouTube IDs from watch/share/embed/shorts URLs', () => {
    expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFromUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFromUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeIdFromUrl('https://vimeo.com/123456')).toBeNull();
    expect(youtubeIdFromUrl('https://example.com/video.mp4')).toBeNull();
  });

  it('builds YouTube thumbnails and previews cover-first', () => {
    expect(videoThumbnailUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(videoThumbnailUrl('https://vimeo.com/123456')).toBeNull();
    const video = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'video' as const };
    // Cover wins when present.
    expect(previewImageUrl('https://x/cover.jpg', [video])).toBe('https://x/cover.jpg');
    // Video thumbnail fills in for cover-less posts.
    expect(previewImageUrl(null, [video])).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(previewImageUrl('  ', [video])).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    // Audio/docs never become the preview image.
    expect(previewImageUrl(null, [{ url: 'https://x/a.mp3', kind: 'audio' as const }])).toBeNull();
    expect(previewImageUrl(null, null)).toBeNull();
  });

  it('treats a video link as publishable media (no cover photo required)', () => {
    // A YouTube/Vimeo link in the intake list yields a cover via
    // previewImageUrl, so publish readiness must accept it.
    expect(hasVideoMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(hasVideoMedia('https://youtu.be/dQw4w9WgXcQ - A clip')).toBe(true);
    expect(hasVideoMedia('https://x/clip.mp4')).toBe(true);
    // Audio/docs/images are never a video source.
    expect(hasVideoMedia('https://x/a.mp3')).toBe(false);
    expect(hasVideoMedia('https://x/photo.jpg')).toBe(false);
    expect(hasVideoMedia('')).toBe(false);
    expect(hasVideoMedia(null)).toBe(false);
  });

  it('resolves display images with the site-logo fallback chain', () => {
    expect(resolveDisplayImage('https://x/display.jpg', 'https://x/logo.jpg')).toBe('https://x/display.jpg');
    expect(resolveDisplayImage(null, 'https://x/logo.jpg')).toBe('https://x/logo.jpg');
    expect(resolveDisplayImage('  ', 'https://x/logo.jpg')).toBe('https://x/logo.jpg');
    expect(resolveDisplayImage(null, null)).toBe('/images/default-display.jpg');
  });

  it('accepts is_cover only on a photograph', () => {
    // The row the public hero will actually use.
    expect(coverRow([{ public_url: 'https://x/a.jpg', is_cover: true, kind: 'image' }])?.public_url).toBe(
      'https://x/a.jpg',
    );
    // No kind = a legacy photograph row, still a valid cover.
    expect(coverRow([{ public_url: 'https://x/old.jpg', is_cover: true, kind: null }])?.public_url).toBe(
      'https://x/old.jpg',
    );
    // A video/audio/document row flagged is_cover is ignored — trusting it put
    // a raw media URL in the hero <img> and the share card (the "cover is
    // broken but the video is fine" report).
    expect(coverRow([{ public_url: 'https://youtu.be/x', is_cover: true, kind: 'video' }])).toBeUndefined();
    expect(coverRow([{ public_url: 'https://x/a.mp3', is_cover: true, kind: 'audio' }])).toBeUndefined();
    // A video cover must not shadow a real photograph behind it.
    const mixed = [
      { public_url: 'https://youtu.be/x', is_cover: true, kind: 'video' },
      { public_url: 'https://x/a.jpg', is_cover: false, kind: 'image' },
    ];
    expect(coverRow(mixed)).toBeUndefined();
    // Unflagged and empty inputs stay undefined.
    expect(coverRow([{ public_url: 'https://x/a.jpg', is_cover: false, kind: 'image' }])).toBeUndefined();
    expect(coverRow(null)).toBeUndefined();
    expect(coverRow([])).toBeUndefined();
  });
});

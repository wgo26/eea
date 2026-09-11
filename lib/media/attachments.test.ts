import { describe, expect, it } from 'vitest';
import { formatDuration, inferKindFromUrl, mapAttachments, parseMediaList, supportingMedia } from './attachments';

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
});

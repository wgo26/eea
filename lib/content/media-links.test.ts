import { describe, expect, it } from 'vitest';
import { attachmentsFromMediaLinks, serializeMediaLinks } from './media-links';

/**
 * The editor's single media-links field. These cases pin the two behaviours the
 * three-into-one consolidation depends on: the kind is inferred from the URL
 * (so an editor never classifies a link by hand), and a line that matches a
 * stored row keeps that row's id (so an edit updates it instead of deleting and
 * re-inserting it).
 */
describe('content media links field', () => {
  it('infers video / audio / document / image from the URL', () => {
    const rows = attachmentsFromMediaLinks(
      [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://x/clip.mp4',
        'https://x/talk.mp3',
        'https://x/notice.pdf',
        'https://x/cover.jpg',
      ].join('\n'),
    );
    expect(rows.map((r) => r.kind)).toEqual(['video', 'video', 'audio', 'document', 'image']);
  });

  it('reads the optional " - caption" suffix', () => {
    const [row] = attachmentsFromMediaLinks('https://youtu.be/dQw4w9WgXcQ - Market opens at dawn');
    expect(row.caption).toBe('Market opens at dawn');
    expect(row.kind).toBe('video');
  });

  it('re-attaches the stored row id by URL match', () => {
    const existing = [
      { id: 'row-video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { id: 'row-pdf', url: 'https://x/notice.pdf' },
    ];
    const rows = attachmentsFromMediaLinks(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://x/notice.pdf',
      existing,
    );
    expect(rows.map((r) => r.assetId)).toEqual(['row-video', 'row-pdf']);
  });

  it('leaves a new URL without an id (and drops no-longer-listed rows)', () => {
    const rows = attachmentsFromMediaLinks('https://x/new.mp3', [
      { id: 'row-removed', url: 'https://x/old.mp4' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].assetId).toBeUndefined();
  });

  it('round-trips rows → text → rows', () => {
    const stored = [
      { url: 'https://youtu.be/dQw4w9WgXcQ', caption: 'A clip' },
      { url: 'https://x/notice.pdf', caption: null },
    ];
    const text = serializeMediaLinks(stored);
    expect(text).toBe('https://youtu.be/dQw4w9WgXcQ - A clip\nhttps://x/notice.pdf');
    const back = attachmentsFromMediaLinks(text, stored.map((r, i) => ({ id: `id-${i}`, url: r.url })));
    expect(back.map((r) => [r.url, r.caption, r.assetId])).toEqual([
      ['https://youtu.be/dQw4w9WgXcQ', 'A clip', 'id-0'],
      ['https://x/notice.pdf', undefined, 'id-1'],
    ]);
  });

  it('serializes nothing for no rows', () => {
    expect(serializeMediaLinks(null)).toBe('');
    expect(serializeMediaLinks([])).toBe('');
    expect(serializeMediaLinks(undefined)).toBe('');
  });
});

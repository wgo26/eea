import { describe, expect, it } from 'vitest';
import { CONTENT_TYPE_SEGMENT, contentPublicPath } from './public-path';

/**
 * The type→section mapping is the one place that decides which public section a
 * permalink resolves under. It feeds the admin "View live" link, the permalink
 * preview on the content form, and the publish-time route revalidation — so a
 * regression here reads to an editor as "correct slug, 404".
 */
describe('content public paths', () => {
  it('addresses slug routes for news / photo stories / culture', () => {
    expect(contentPublicPath({ type: 'news', slug: 'market-closed' })).toBe('/news/market-closed');
    expect(contentPublicPath({ type: 'photo_story', slug: 'mankon-dawn' })).toBe('/photo-stories/mankon-dawn');
    expect(contentPublicPath({ type: 'culture', slug: 'njangi-festival' })).toBe('/culture/njangi-festival');
  });

  it('returns null for slug routes when no slug exists yet', () => {
    expect(contentPublicPath({ type: 'news', slug: null })).toBeNull();
    expect(contentPublicPath({ type: 'photo_story', slug: '' })).toBeNull();
    expect(contentPublicPath({ type: 'culture' })).toBeNull();
  });

  it('resolves listings by slug then id, and notices by id then slug', () => {
    expect(contentPublicPath({ type: 'listing', slug: 'yam-for-sale', id: 'uuid-1' })).toBe('/buy-sell/yam-for-sale');
    // A listing without a slug still resolves through its id.
    expect(contentPublicPath({ type: 'listing', slug: null, id: 'uuid-1' })).toBe('/buy-sell/uuid-1');
    // Notices prefer the id (what "View live" has always linked to).
    expect(contentPublicPath({ type: 'notice', slug: 'road-closed', id: 'uuid-2' })).toBe('/notices/uuid-2');
    // ...but a pre-save notice (no id yet) previews under its slug.
    expect(contentPublicPath({ type: 'notice', slug: 'road-closed', id: null })).toBe('/notices/road-closed');
  });

  it('points micro stories at the street rail and unknown types nowhere', () => {
    expect(contentPublicPath({ type: 'micro_story', slug: 'spotted' })).toBe('/street');
    expect(contentPublicPath({ type: 'fundraiser', slug: 'x' })).toBeNull();
  });

  it('knows a section for every addressable content type', () => {
    expect(CONTENT_TYPE_SEGMENT).toEqual({
      photo_story: '/photo-stories',
      news: '/news',
      micro_story: '/news',
      listing: '/buy-sell',
      notice: '/notices',
      culture: '/culture',
    });
  });
});

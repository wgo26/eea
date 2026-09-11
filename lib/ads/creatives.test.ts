import { describe, expect, it } from 'vitest';
import { isAdFormat, isHttpsUrl, sanitizeCreativeHtml, validateCreative } from './creatives';

describe('ad creatives', () => {
  it('recognizes the five formats', () => {
    expect(isAdFormat('video')).toBe(true);
    expect(isAdFormat('banner')).toBe(false);
    expect(isAdFormat(null)).toBe(false);
  });

  it('requires https destinations', () => {
    expect(isHttpsUrl('https://x.com/a')).toBe(true);
    expect(isHttpsUrl('http://x.com/a')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
  });

  it('strips active content from HTML creatives', () => {
    expect(sanitizeCreativeHtml('<script>alert(1)</script><p>Hi</p>')).toBe('<p>Hi</p>');
    expect(sanitizeCreativeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="#">x</a>');
    expect(sanitizeCreativeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">');
    expect(sanitizeCreativeHtml('just text')).toBeNull();
    expect(sanitizeCreativeHtml('')).toBeNull();
  });

  it('validates creatives against slot constraints', () => {
    expect(
      validateCreative({ format: 'video', allowedFormats: ['image', 'sponsored'] }),
    ).toMatch(/does not accept/);
    expect(validateCreative({ format: 'image' })).toMatch(/need a desktop/);
    expect(
      validateCreative({ format: 'video', desktopUrl: 'https://x/v.mp4', maxDurationSeconds: 15, durationSeconds: 30 }),
    ).toMatch(/too long/);
    expect(
      validateCreative({ format: 'image', desktopUrl: 'https://x/a.jpg' }),
    ).toBeNull();
    expect(validateCreative({ format: 'sponsored' })).toBeNull();
  });
});

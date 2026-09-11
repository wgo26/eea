import { describe, expect, it } from 'vitest'
import { sanitizeBodyHtml } from './html'

describe('sanitizeBodyHtml', () => {
  it('strips scripts and event handlers from imported bodies', () => {
    const body = '<p>Hello <script>alert(1)</script>world</p><img src="x" onerror="alert(1)">'
    expect(sanitizeBodyHtml(body)).toBe('<p>Hello world</p><img src="x">')
  })

  it('neutralizes javascript: URLs but keeps safe links and images', () => {
    const body = '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a></p><img src="https://example.com/a.jpg">'
    expect(sanitizeBodyHtml(body)).toBe('<p><a href="#">bad</a> <a href="https://example.com">good</a></p><img src="https://example.com/a.jpg">')
  })

  it('preserves typical Blogger markup untouched', () => {
    const body = '<div class="separator"><a href="https://blogger.googleusercontent.com/img.png"><img src="https://blogger.googleusercontent.com/img.png" /></a></div><br /><p>Some text</p>'
    expect(sanitizeBodyHtml(body)).toBe(body)
  })

  it('keeps plain text bodies (unlike ad creatives they are not rejected)', () => {
    expect(sanitizeBodyHtml('just a plain paragraph')).toBe('just a plain paragraph')
  })

  it('returns null for empty input', () => {
    expect(sanitizeBodyHtml(null)).toBeNull()
    expect(sanitizeBodyHtml('')).toBeNull()
  })

  it('caps oversized bodies at 500k chars', () => {
    const big = `<p>${'x'.repeat(600_000)}</p>`
    expect(sanitizeBodyHtml(big)?.length).toBe(500_000)
  })
})
import { describe, expect, it } from 'vitest'
import { sanitizeBodyHtml, sanitizeHtml } from './html'

describe('sanitizeBodyHtml (parser-based allowlist)', () => {
  it('strips scripts and event handlers from imported bodies', () => {
    const body = '<p>Hello <script>alert(1)</script>world</p><img src="x" onerror="alert(1)">'
    expect(sanitizeBodyHtml(body)).toBe('<p>Hello world</p><img src="x" />')
  })

  it('drops unsafe URL schemes but keeps safe links and images', () => {
    const body =
      '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com">good</a></p><img src="https://example.com/a.jpg">'
    expect(sanitizeBodyHtml(body)).toBe(
      '<p><a>bad</a> <a href="https://example.com">good</a></p><img src="https://example.com/a.jpg" />',
    )
  })

  it('preserves typical Blogger markup untouched', () => {
    const body =
      '<div class="separator"><a href="https://blogger.googleusercontent.com/img.png"><img src="https://blogger.googleusercontent.com/img.png" /></a></div><br /><p>Some text</p>'
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

describe('sanitizeBodyHtml exploit regression (mXSS + smuggling)', () => {
  it('dissolves nested-tag script smuggling into tag-free text', () => {
    const out = sanitizeBodyHtml('<scr<script>ipt>alert(1)</scr</script>ipt>')
    // Everything tag-like is consumed; whatever text remains is escaped —
    // no markup of any kind survives, so nothing can execute.
    expect(out).not.toContain('<')
    expect(out).not.toContain('<script')
  })

  it('neutralizes the noscript attribute-breaking mXSS vector', () => {
    const out = sanitizeBodyHtml('<noscript><p title="</noscript><img src=x onerror=alert(1)>">')
    expect(out ?? '').not.toContain('onerror')
    expect(out ?? '').not.toContain('<img')
  })

  it('drops svg foreign content entirely', () => {
    const out = sanitizeBodyHtml('<svg><script>alert(1)</script><circle onload="alert(2)"/></svg>ok')
    expect(out).toBe('ok')
  })

  it('decodes entity-obfuscated javascript: schemes before dropping them', () => {
    const out = sanitizeBodyHtml('<a href="jav&#x09;ascript:alert(1)">x</a>')
    expect(out).toBe('<a>x</a>')
  })

  it('drops protocol-relative URLs', () => {
    expect(sanitizeBodyHtml('<a href="//evil.example/x">x</a>')).toBe('<a>x</a>')
  })

  it('drops data: URIs everywhere (including img src)', () => {
    expect(sanitizeBodyHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">pic')).toBe('<img />pic')
  })

  it('strips srcset and other non-allowlisted attributes', () => {
    expect(sanitizeBodyHtml('<img src="https://a/b.png" srcset="https://evil/x 2x" loading="lazy">')).toBe(
      '<img src="https://a/b.png" />',
    )
  })

  it('removes forms and their content', () => {
    const out = sanitizeBodyHtml('<form action="https://evil"><input name="pw"><button>Go</button></form>visible text')
    expect(out).toBe('visible text')
  })

  it('removes iframes and embedded objects with their content', () => {
    expect(sanitizeBodyHtml('<iframe src="https://evil"></iframe><p>after</p>')).toBe('<p>after</p>')
    expect(sanitizeBodyHtml('<object data="https://evil"></object><p>after</p>')).toBe('<p>after</p>')
  })

  it('allowlists CSS properties (url() never survives a style value)', () => {
    const out = sanitizeBodyHtml('<div style="background:url(javascript:alert(1));text-align:center">x</div>')
    expect(out ?? '').not.toContain('url(')
    expect(out ?? '').toMatch(/text-align:\s*center/)
  })

  it('keeps allowlisted inline CSS (Blogger centering survives)', () => {
    const out = sanitizeBodyHtml('<p style="text-align: center">Centered</p>')
    expect(out ?? '').toMatch(/text-align:\s*center/)
    expect(out ?? '').toContain('Centered')
  })

  it('emits no half-written tag at the truncation point', () => {
    const out = sanitizeHtml(`<b>${'x'.repeat(30)}</b><img src="x" onerror="alert(1)">`, 20)
    expect(out ?? '').not.toContain('onerror')
    expect(out?.length ?? 0).toBeLessThanOrEqual(20)
  })

  it('keeps entity-encoded text properly escaped', () => {
    const out = sanitizeBodyHtml('<p>5 &lt; 10 &amp; 20</p>')
    expect(out).toBe('<p>5 &lt; 10 &amp; 20</p>')
  })

  it('keeps mailto links', () => {
    expect(sanitizeBodyHtml('<a href="mailto:news@eagleeyeafrica.org">mail</a>')).toBe(
      '<a href="mailto:news@eagleeyeafrica.org">mail</a>',
    )
  })

  it('uppercases/mixed-case tags are normalized away', () => {
    expect(sanitizeBodyHtml('<SCRIPT SRC=https://evil/x.js></SCRIPT><p>ok</p>')).toBe('<p>ok</p>')
    expect(sanitizeBodyHtml('<IMG SRC="x" ONERROR="alert(1)">')).toBe('<img src="x" />')
  })
})
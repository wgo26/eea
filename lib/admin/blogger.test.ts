import { describe, expect, it } from 'vitest'
import { extractImageUrls, makeExcerpt, parseBloggerExport } from './blogger'

const SAMPLE = `<?xml version='1.0' encoding='UTF-8' ?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:blogger='http://schemas.google.com/blogger/2008'>
  <entry>
    <id>tag:blogger.com,1999:blog-1.post-11</id>
    <published>2023-05-01T10:00:00+01:00</published>
    <updated>2023-05-02T10:00:00+01:00</updated>
    <category scheme='http://schemas.google.com/g/2005#kind' term='http://schemas.google.com/blogger/2008/kind#post' />
    <category scheme='http://www.blogger.com/atom/ns#' term='Bamenda' />
    <category scheme='http://www.blogger.com/atom/ns#' term='Markets' />
    <title type='text'>Market day in Bamenda</title>
    <content type='html'>&lt;p&gt;Hello &lt;strong&gt;world&lt;/strong&gt;&lt;/p&gt;&lt;img src="https://example.com/a.jpg" /&gt;</content>
    <link rel='alternate' type='text/html' href='https://example.blogspot.com/2023/05/market-day.html' />
    <author><name>Test Author</name></author>
  </entry>
  <entry>
    <id>tag:blogger.com,1999:blog-1.post-99</id>
    <published>2023-05-03T10:00:00+01:00</published>
    <category scheme='http://schemas.google.com/g/2005#kind' term='http://schemas.google.com/blogger/2008/kind#comment' />
    <title type='text'>A comment</title>
    <content type='html'>not a post</content>
  </entry>
  <entry>
    <id>tag:blogger.com,1999:blog-1.post-12</id>
    <published>2023-06-01T10:00:00+01:00</published>
    <category scheme='http://schemas.google.com/g/2005#kind' term='http://schemas.google.com/blogger/2008/kind#post' />
    <title type='text'></title>
    <content type='html'>&lt;p&gt;Photo only post&lt;/p&gt;</content>
    <link rel='alternate' type='text/html' href='https://example.blogspot.com/2023/06/photo.html' />
  </entry>
</feed>`

describe('parseBloggerExport', () => {
  it('keeps posts and skips comments', () => {
    const posts = parseBloggerExport(SAMPLE)
    expect(posts).toHaveLength(2)
    expect(posts[0].title).toBe('Market day in Bamenda')
    expect(posts[0].labels).toEqual(['Bamenda', 'Markets'])
    expect(posts[0].originalUrl).toBe('https://example.blogspot.com/2023/05/market-day.html')
    expect(posts[0].bodyHtml).toContain('<p>Hello')
    expect(posts[0].authorName).toBe('Test Author')
  })

  it('falls back to body text when the title is empty', () => {
    const posts = parseBloggerExport(SAMPLE)
    expect(posts[1].title).toContain('Photo only post')
  })

  it('throws on empty input', () => {
    expect(() => parseBloggerExport('  ')).toThrow()
  })
})

describe('extractImageUrls', () => {
  it('collects https image sources only', () => {
    expect(extractImageUrls('<p>x</p><img src="https://a.com/1.jpg"><img src="data:abc">')).toEqual([
      'https://a.com/1.jpg',
    ])
  })
})

describe('makeExcerpt', () => {
  it('strips tags and caps length', () => {
    expect(makeExcerpt('<p>Hello <b>world</b></p>')).toBe('Hello world')
    expect(makeExcerpt(`<p>${'a'.repeat(500)}</p>`, 100)).toHaveLength(100)
  })
})

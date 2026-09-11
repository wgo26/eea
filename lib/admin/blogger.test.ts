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

const TAKEOUT_SAMPLE = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:blogger='http://schemas.google.com/blogger/2018'>
  <id>tag:blogger.com,1999:blog-426198324410599347</id>
  <title>EAGLE EYE AFRICA</title>
  <entry>
    <id>tag:blogger.com,1999:blog-426198324410599347.post-126186913167950319</id>
    <blogger:type>POST</blogger:type>
    <blogger:status>LIVE</blogger:status>
    <author><name>EAGLE EYE AFRICA</name></author>
    <title>Workshop &amp;#39;reshape&amp;#39; coordination</title>
    <content type='html'>&lt;div&gt;By Wirngo Peter&lt;/div&gt;&lt;img src="https://blogger.googleusercontent.com/img/x/w320-h214/1001531157.png" /&gt;</content>
    <blogger:metaDescription>Workshop summary for SEO</blogger:metaDescription>
    <blogger:created>2026-06-18T01:42:56.898Z</blogger:created>
    <published>2026-06-18T01:45:55.218Z</published>
    <updated>2026-06-18T01:45:55.218Z</updated>
    <blogger:location/>
    <category/>
    <blogger:filename>/2026/06/bamenda-hosts-key-workshop.html</blogger:filename>
    <link/>
    <enclosure/>
    <blogger:trashed/>
  </entry>
  <entry>
    <id>tag:blogger.com,1999:blog-426198324410599347.post-793021033970468890</id>
    <blogger:type>POST</blogger:type>
    <blogger:status>DRAFT</blogger:status>
    <title>Bamenda Celebrates World Environment Day 2025: "Beating Plastic Pollution"</title>
    <content type='html'>&lt;div&gt;Draft body&lt;/div&gt;</content>
    <blogger:filename>/2025/06/world-environment-day-2025.html</blogger:filename>
    <published>2025-06-04T16:52:00Z</published>
  </entry>
  <entry>
    <id>tag:blogger.com,1999:blog-426198324410599347.page-1</id>
    <blogger:type>PAGE</blogger:type>
    <blogger:status>DRAFT</blogger:status>
    <title>An about page</title>
    <content type='html'>&lt;div&gt;page body&lt;/div&gt;</content>
  </entry>
  <entry>
    <id>tag:blogger.com,1999:blog-426198324410599347.comment-1</id>
    <blogger:type>COMMENT</blogger:type>
    <blogger:status>LIVE</blogger:status>
    <title>A comment</title>
    <content type='html'>&lt;div&gt;comment body&lt;/div&gt;</content>
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

  it('parses the Google Takeout format (blogger:type/status/filename)', () => {
    const posts = parseBloggerExport(TAKEOUT_SAMPLE)
    // 2 posts; the PAGE and COMMENT entries are skipped.
    expect(posts).toHaveLength(2)
    expect(posts[0].status).toBe('LIVE')
    expect(posts[0].filename).toBe('/2026/06/bamenda-hosts-key-workshop.html')
    expect(posts[0].metaDescription).toBe('Workshop summary for SEO')
    expect(posts[0].publishedAt).toBe('2026-06-18T01:45:55.218Z')
    // Double-escaped entities in Takeout titles are fully unescaped.
    expect(posts[0].title).toBe("Workshop 'reshape' coordination")
    expect(posts[0].bodyHtml).toContain('1001531157.png')
    expect(posts[1].status).toBe('DRAFT')
    expect(posts[1].title).toContain('Beating Plastic Pollution')
  })

  it('marks classic-format posts as status null', () => {
    const posts = parseBloggerExport(SAMPLE)
    expect(posts[0].status).toBeNull()
    expect(posts[0].filename).toBeNull()
    expect(posts[0].metaDescription).toBeNull()
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

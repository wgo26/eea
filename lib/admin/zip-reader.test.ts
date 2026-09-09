import { describe, expect, it } from 'vitest'
import { crc32, readZipEntries, xmlFilesFromZip } from './zip-reader'

// ---------------------------------------------------------------------------
// Minimal ZIP *writer* used to build fixture archives in-memory. Node ≥ 18
// provides the same web streams globals the reader relies on
// (CompressionStream / DecompressionStream / Blob / Response), so the
// round-trip exercises the real deflate path.
// ---------------------------------------------------------------------------

function u16le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff]
}
function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

async function deflateRaw(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

type FixtureEntry = {
  name: string
  method: 0 | 8
  /** Bytes stored in the archive (already compressed for method 8). */
  data: Uint8Array
  /** CRC of the UNCOMPRESSED content — ZIP stores it in both directories. */
  crc?: number
}

/** Build a deflate (method 8) fixture entry with the correct content CRC. */
async function deflateEntry(name: string, content: string): Promise<FixtureEntry> {
  return {
    name,
    method: 8,
    data: await deflateRaw(content),
    crc: crc32(new TextEncoder().encode(content)),
  }
}

function buildZip(entries: FixtureEntry[]): ArrayBuffer {
  const locals: number[] = []
  const central: number[] = []

  for (const entry of entries) {
    const nameBytes = [...new TextEncoder().encode(entry.name)]
    const crc = entry.crc ?? crc32(entry.data)
    const localOffset = locals.length

    // Local file header (sizes are always written correctly here).
    locals.push(
      ...u32le(0x04034b50),
      ...u16le(20), // version needed
      ...u16le(0), // flags
      ...u16le(entry.method),
      ...u16le(0), // time
      ...u16le(0), // date
      ...u32le(crc),
      ...u32le(entry.data.length), // compressed size
      ...u32le(entry.data.length), // uncompressed size
      ...u16le(nameBytes.length),
      ...u16le(0), // extra len
      ...nameBytes,
      ...entry.data,
    )

    // Central directory record.
    central.push(
      ...u32le(0x02014b50),
      ...u16le(20), // version made by
      ...u16le(20), // version needed
      ...u16le(0), // flags
      ...u16le(entry.method),
      ...u16le(0), // time
      ...u16le(0), // date
      ...u32le(crc),
      ...u32le(entry.data.length),
      ...u32le(entry.data.length),
      ...u16le(nameBytes.length),
      ...u16le(0), // extra len
      ...u16le(0), // comment len
      ...u16le(0), // disk start
      ...u16le(0), // internal attrs
      ...u32le(0), // external attrs
      ...u32le(localOffset),
      ...nameBytes,
    )
  }

  const eocd: number[] = [
    ...u32le(0x06054b50),
    ...u16le(0), // disk
    ...u16le(0), // cd disk
    ...u16le(entries.length),
    ...u16le(entries.length),
    ...u32le(central.length),
    ...u32le(locals.length),
    ...u16le(0), // comment len
  ]

  return new Uint8Array([...locals, ...central, ...eocd]).buffer
}

describe('readZipEntries', () => {
  it('round-trips a deflate-compressed .xml entry', async () => {
    const xml = '<?xml version="1.0"?><feed><entry>ok</entry></feed>'
    const buf = buildZip([await deflateEntry('blog-01-01-2026.xml', xml)])
    const entries = await readZipEntries(buf)
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('blog-01-01-2026.xml')
    expect(new TextDecoder().decode(entries[0].data)).toBe(xml)
  })

  it('supports stored (method 0) entries', async () => {
    const body = new TextEncoder().encode('plain text payload')
    const buf = buildZip([{ name: 'notes.txt', method: 0, data: body }])
    const entries = await readZipEntries(buf)
    expect(entries).toHaveLength(1)
    expect(new TextDecoder().decode(entries[0].data)).toBe('plain text payload')
  })

  it('reads multiple entries and skips directory entries', async () => {
    const buf = buildZip([
      { name: 'media/', method: 0, data: new Uint8Array(0) },
      await deflateEntry('a.xml', '<a/>'),
      await deflateEntry('media/b.xml', '<b/>'),
    ])
    const entries = await readZipEntries(buf)
    expect(entries.map((e) => e.name)).toEqual(['a.xml', 'media/b.xml'])
  })

  it('throws on non-zip input', async () => {
    const buf = new TextEncoder().encode('<?xml version="1.0"?><feed></feed>').buffer
    await expect(readZipEntries(buf)).rejects.toThrow(/Not a ZIP archive/)
  })

  it('throws on a CRC mismatch (corrupted payload)', async () => {
    const buf = buildZip([{ name: 'blog.xml', method: 8, data: await deflateRaw('<feed/>'), crc: 123456789 }])
    await expect(readZipEntries(buf)).rejects.toThrow(/CRC mismatch/)
  })
})

describe('xmlFilesFromZip', () => {
  it('returns only .xml files (skips media, __MACOSX junk, directories)', async () => {
    const buf = buildZip([
      await deflateEntry('blog-01-01-2026.xml', '<feed/>'),
      await deflateEntry('media/photo.jpg', 'jpeg-bytes'),
      await deflateEntry('__MACOSX/blog-01-01-2026.xml', '<junk/>'),
      { name: 'data.json', method: 0, data: new TextEncoder().encode('{}') },
    ])
    const files = await xmlFilesFromZip(buf)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('blog-01-01-2026.xml')
    expect(files[0].xml).toBe('<feed/>')
  })

  it('returns an empty list when the zip has no .xml files', async () => {
    const buf = buildZip([{ name: 'readme.txt', method: 0, data: new TextEncoder().encode('hi') }])
    expect(await xmlFilesFromZip(buf)).toEqual([])
  })
})

/**
 * Dependency-free ZIP reader for content-import uploads.
 *
 * Blogger's "Back up content" downloads a .zip (blog-DD-MM-YYYY.zip) that
 * contains the .xml Atom backup the importer parses. Rather than pulling in
 * a zip library, this reads the ZIP container directly (end-of-central-
 * directory + central directory + local headers) and inflates entries with
 * the platform-native DecompressionStream('deflate-raw') — available in all
 * modern browsers and in Node ≥ 18, so the same code runs in the import
 * client (browser) and in vitest (node).
 *
 * Supported: stored (method 0) and Deflate (method 8) entries, entries with
 * data descriptors (sizes are taken from the central directory, not the
 * local header). Rejected: encrypted entries, Zip64, unknown methods.
 *
 * Safety caps guard against zip bombs: entry count and total uncompressed
 * size are bounded, and every entry's CRC-32 is verified after extraction.
 */

const MAX_ENTRIES = 4096
const MAX_TOTAL_UNCOMPRESSED = 512 * 1024 * 1024 // 512 MB across all entries

export type ZipEntry = {
  /** Full path as stored in the archive (directory entries end with '/'). */
  name: string
  data: Uint8Array
}

// --- CRC-32 (IEEE 802.3, the ZIP polynomial) — exported for the unit test ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// --- little-endian readers ---
function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}
function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** Scan back from the end for the end-of-central-directory record. */
function findEocd(view: DataView, byteLength: number): number {
  const min = Math.max(0, byteLength - 22 - 65535)
  for (let i = byteLength - 22; i >= min; i--) {
    if (u32(view, i) === SIG_EOCD) return i
  }
  throw new Error('Not a ZIP archive (no end-of-central-directory record).')
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const output = source.pipeThrough(
    // DecompressionStream is typed WritableStream<BufferSource>; cast to the
    // pair shape pipeThrough expects (runtime is a plain deflate-raw stream).
    new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBufferLike>
    >,
  )
  const buf = await new Response(output).arrayBuffer()
  return new Uint8Array(buf)
}

/** Read every file entry out of a ZIP archive buffer. */
export async function readZipEntries(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (bytes.length < 22) throw new Error('Not a ZIP archive (file too small).')

  const eocd = findEocd(view, bytes.length)
  const entryCount = u16(view, eocd + 10)
  const dirOffset = u32(view, eocd + 16)
  if (entryCount === 0xffff || dirOffset === 0xffffffff) {
    throw new Error('Zip64 archives are not supported — unzip the file and upload the .xml instead.')
  }
  if (entryCount > MAX_ENTRIES) throw new Error('This archive contains too many files.')

  const out: ZipEntry[] = []
  let totalUncompressed = 0
  let cursor = dirOffset
  const decoder = new TextDecoder()

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > bytes.length || u32(view, cursor) !== SIG_CENTRAL) {
      throw new Error('Corrupt ZIP archive (bad central directory).')
    }
    const flags = u16(view, cursor + 8)
    const method = u16(view, cursor + 10)
    const crc = u32(view, cursor + 16)
    const compressedSize = u32(view, cursor + 20)
    const nameLen = u16(view, cursor + 28)
    const extraLen = u16(view, cursor + 30)
    const commentLen = u16(view, cursor + 32)
    const localOffset = u32(view, cursor + 42)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen))
    cursor += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue // directory entry
    if (flags & 0x1) throw new Error(`Encrypted entry "${name}" — encrypted ZIPs are not supported.`)
    if (method !== 0 && method !== 8) {
      throw new Error(`Unsupported compression (method ${method}) for "${name}".`)
    }

    // Sizes/offsets come from the central directory, so data-descriptor
    // entries (flag bit 3, zero sizes in the local header) work too.
    if (localOffset + 30 > bytes.length || u32(view, localOffset) !== SIG_LOCAL) {
      throw new Error(`Corrupt ZIP archive (bad local header for "${name}").`)
    }
    const localNameLen = u16(view, localOffset + 26)
    const localExtraLen = u16(view, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    if (dataStart + compressedSize > bytes.length) {
      throw new Error(`Corrupt ZIP archive (truncated "${name}").`)
    }
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)
    const data = method === 0 ? new Uint8Array(raw) : await inflateRaw(raw)

    totalUncompressed += data.length
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
      throw new Error('This archive decompresses to more than 512 MB — unzip it locally and upload the .xml instead.')
    }
    if (crc32(data) !== crc) throw new Error(`Corrupt ZIP archive (CRC mismatch for "${name}").`)
    out.push({ name, data })
  }

  return out
}

const XML_NAME_RE = /\.xml$/i

/**
 * All `.xml` files in a ZIP archive, decoded to text — the shape content
 * exports arrive in (a Blogger zip holds blog-DD-MM-YYYY.xml alongside its
 * media folders). macOS junk (__MACOSX/…) and non-XML files are skipped.
 */
export async function xmlFilesFromZip(buffer: ArrayBuffer): Promise<{ name: string; xml: string }[]> {
  const entries = await readZipEntries(buffer)
  const decoder = new TextDecoder()
  const files: { name: string; xml: string }[] = []
  for (const entry of entries) {
    if (entry.name.includes('__MACOSX')) continue
    if (!XML_NAME_RE.test(entry.name)) continue
    files.push({ name: entry.name, xml: decoder.decode(entry.data) })
  }
  return files
}

import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, mimeToKind } from './config'
import { logger } from '@/lib/observability/logger'
import { StorageValidationError } from './types'
import type { MediaKind, StorageDestination } from './types'

export interface ValidatedFile {
  buffer: Buffer
  mimeType: string
  kind: MediaKind
  width: number | null
  height: number | null
}

/**
 * Every check here is deliberately "trust the bytes, not the client":
 *   - size checked against the actual buffer length
 *   - type checked by sniffing magic bytes (file-type), never the
 *     browser-supplied Content-Type or the filename extension
 *   - images are always re-encoded through sharp before upload, which
 *     both strips embedded metadata/scripts and defeats the class of
 *     exploits that rely on a malformed-but-"valid" image file
 *   - anything not on the explicit image/video/audio/document allowlist
 *     in lib/storage/config.ts is rejected outright — this is what makes
 *     executable content rejection a byproduct of the allowlist rather
 *     than something requiring its own denylist logic
 */
export async function validateUpload(
  buffer: Buffer,
  declaredMimeType: string,
  destination: StorageDestination
): Promise<ValidatedFile> {
  const maxBytes = MAX_FILE_SIZE_BYTES[destination]
  if (buffer.byteLength === 0) {
    throw new StorageValidationError('Empty file.')
  }
  if (buffer.byteLength > maxBytes) {
    throw new StorageValidationError(
      `File is too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB, max ${Math.round(
        maxBytes / 1024 / 1024
      )}MB).`
    )
  }

  const sniffed = await fileTypeFromBuffer(buffer)
  if (!sniffed) {
    throw new StorageValidationError('Could not verify file type from its contents.')
  }

  const kind = mimeToKind(sniffed.mime)
  if (!kind) {
    throw new StorageValidationError(`File type "${sniffed.mime}" is not allowed.`)
  }

  // Belt-and-braces: the sniffed type must also be in the allowlist for its
  // kind (mimeToKind already guarantees this, but this keeps the intent
  // explicit rather than implicit in a lookup).
  if (!ALLOWED_MIME_TYPES[kind].includes(sniffed.mime)) {
    throw new StorageValidationError(`File type "${sniffed.mime}" is not allowed for ${kind}.`)
  }

  // Client Content-Type is informational only, but a wild mismatch is a
  // useful signal to log even though it isn't itself a rejection reason —
  // the sniffed type is what's trusted and used from here on.
  if (declaredMimeType && !declaredMimeType.startsWith(kind) && declaredMimeType !== sniffed.mime) {
    logger.warn('validateUpload', 'declared MIME mismatch (trusting sniffed bytes)', { declaredMimeType, sniffed: sniffed.mime })
  }

  if (kind === 'image') {
    return reencodeImage(buffer, sniffed.mime)
  }

  return { buffer, mimeType: sniffed.mime, kind, width: null, height: null }
}

async function reencodeImage(buffer: Buffer, mimeType: string): Promise<ValidatedFile> {
  const image = sharp(buffer, { failOn: 'error' }).rotate() // rotate() auto-applies EXIF orientation, then strips EXIF on output
  const metadata = await image.metadata()

  const MAX_DIMENSION = 4000
  const resized = image.resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  })

  const isPng = mimeType === 'image/png'
  const output = isPng ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.jpeg({ quality: 85 }).toBuffer()
  const finalMeta = await sharp(output).metadata()

  return {
    buffer: output,
    mimeType: isPng ? 'image/png' : 'image/jpeg',
    kind: 'image',
    width: finalMeta.width ?? metadata.width ?? null,
    height: finalMeta.height ?? metadata.height ?? null,
  }
}

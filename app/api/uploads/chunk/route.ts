import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimitForKey, buildRateLimitKey } from '@/lib/security/rate-limit'
import { uploadMedia } from '@/lib/storage/upload'
import { logger } from '@/lib/observability/logger'
import { StorageValidationError } from '@/lib/storage/types'
import type { StorageDestination } from '@/lib/storage/types'
import { CHUNK_SIZE, MAX_UPLOAD_BYTES, isUploadId } from '@/lib/uploads/chunks'
import {
  assertUploadAccess,
  assembleSession,
  destroySession,
  purgeStaleSessions,
  readMeta,
  readReceived,
  writeChunk,
  type ChunkMeta,
} from '@/lib/uploads/server'

export const runtime = 'nodejs'

/**
 * Chunked resumable uploads (Phase 3 — flaky connections).
 *
 * Protocol:
 *   POST multipart op=chunk     — stores one chunk, returns { received }
 *   GET  ?uploadId=             — returns { received } so the client sends
 *                                  only what's missing (resume)
 *   POST multipart op=complete  — assembles in order and runs the exact same
 *                                  validation + uploadMedia path as the
 *                                  single-shot /api/uploads endpoint
 *
 * Auth, destination rules and content-item ownership reuse
 * assertUploadAccess (shared with the single-shot route — one rule, no
 * drift). Quota design: chunks ride a generous per-IP/per-user allowance
 * (they are fragments, not uploads); only `complete` counts against the
 * 40/hour per-user upload quota. Temp sessions live under os.tmpdir and are
 * purged after 12 h; a complete always cleans up.
 */

// Chunk fragments are cheap: fail fast per IP without a DB round-trip.
const CHUNK_RATE_WINDOW_MS = 60_000;
const CHUNK_RATE_MAX = 300;
const chunkHits = new Map<string, { count: number; resetAt: number }>();

function chunkRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = chunkHits.get(ip);
  if (!entry || now > entry.resetAt) {
    chunkHits.set(ip, { count: 1, resetAt: now + CHUNK_RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > CHUNK_RATE_MAX) return true;
  return false;
}

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Resume probe: which chunk indexes does the server already hold? */
export async function GET(request: Request) {
  const { user } = await getAuthedContext()
  if (!user) return bad('Not authenticated.', 401)
  const uploadId = new URL(request.url).searchParams.get('uploadId') ?? ''
  if (!isUploadId(uploadId)) return bad('Invalid upload id.')
  // Opportunistic stale-session purge (best-effort, never blocks).
  void purgeStaleSessions().catch(() => undefined)
  const [received, meta] = await Promise.all([
    readReceived(user.id, uploadId),
    readMeta(user.id, uploadId),
  ])
  return NextResponse.json({ received, totalChunks: meta?.totalChunks ?? null });
}

export async function POST(request: Request) {
  const ip = clientIp(request)
  if (chunkRateLimited(ip)) {
    return bad('Too many upload requests. Try again later.', 429)
  }

  const { supabase, user } = await getAuthedContext()
  if (!user) return bad('Not authenticated.', 401)

  // Durable per-user fragment allowance (multi-instance safe).
  const fragments = await checkRateLimitForKey(
    buildRateLimitKey('upload-chunk:user', user.id),
    { max: 600, windowMs: 3_600_000, policy: 'fail-closed' },
  )
  if (!fragments.ok) return bad('Too many uploads. Try again later.', 429)

  const form = await request.formData()
  const op = form.get('op')
  const uploadIdRaw = form.get('uploadId')
  const uploadId = typeof uploadIdRaw === 'string' ? uploadIdRaw : ''
  if (!isUploadId(uploadId)) return bad('Invalid upload id.')

  if (op === 'complete') {
    return completeUpload(supabase, user.id, uploadId, ip)
  }
  if (op === 'chunk') {
    return storeChunk(supabase, user, uploadId, form)
  }
  return bad('Unknown op.')
}

async function storeChunk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: NonNullable<Awaited<ReturnType<typeof getAuthedContext>>['user']>,
  uploadId: string,
  form: FormData,
) {
  const userId = user.id
  const indexRaw = form.get('index')
  const totalRaw = form.get('totalChunks')
  const sizeRaw = form.get('size')
  const fileNameRaw = form.get('fileName')
  const mimeRaw = form.get('mimeType')
  const destinationRaw = form.get('destination')
  const contentItemRaw = form.get('contentItemId')
  const durationRaw = form.get('durationSeconds')
  const chunk = form.get('chunk')

  const index = typeof indexRaw === 'string' ? Number(indexRaw) : NaN
  const totalChunks = typeof totalRaw === 'string' ? Number(totalRaw) : NaN
  const size = typeof sizeRaw === 'string' ? Number(sizeRaw) : NaN
  const fileName = typeof fileNameRaw === 'string' ? fileNameRaw.slice(0, 255) : 'upload'
  const mimeType = typeof mimeRaw === 'string' ? mimeRaw.slice(0, 127) : 'application/octet-stream'
  const destination = destinationRaw as StorageDestination
  const contentItemId =
    typeof contentItemRaw === 'string' && contentItemRaw.trim() ? contentItemRaw.trim() : null
  const durationSeconds =
    typeof durationRaw === 'string' && durationRaw.trim() !== '' ? Number(durationRaw) : null

  if (!(chunk instanceof File)) return bad('Missing chunk.')
  if (!Number.isInteger(index) || index < 0) return bad('Invalid index.')
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 25) {
    return bad('Invalid totalChunks.')
  }
  if (index >= totalChunks) return bad('Index out of range.')
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return bad('Invalid size.')
  }
  if (destination !== 'public_photo' && destination !== 'admin_asset') {
    return bad('Invalid destination.')
  }

  const access = await assertUploadAccess(supabase, user, destination, contentItemId)
  if (!access.ok) return bad(access.error, access.status)

  const buffer = Buffer.from(await chunk.arrayBuffer())
  if (buffer.byteLength === 0) return bad('Empty chunk.')
  if (buffer.byteLength > CHUNK_SIZE + 1024 * 1024) return bad('Chunk too large.')

  const existing = await readMeta(userId, uploadId)
  const meta: ChunkMeta = existing ?? {
    fileName,
    mimeType,
    size,
    totalChunks,
    destination,
    contentItemId,
    durationSeconds: Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0 ? durationSeconds : null,
    createdAt: Date.now(),
  }
  // A resumed session must describe the same file — otherwise the assembly
  // would silently mix two different uploads.
  if (
    existing &&
    (existing.totalChunks !== totalChunks ||
      existing.size !== size ||
      existing.destination !== destination ||
      (existing.contentItemId ?? null) !== (contentItemId ?? null))
  ) {
    return bad('Session describes a different file. Start a new upload.')
  }

  await writeChunk(userId, uploadId, index, buffer, meta)
  const received = await readReceived(userId, uploadId)
  return NextResponse.json({ received });
}

async function completeUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  uploadId: string,
  ip: string,
) {
  const meta = await readMeta(userId, uploadId)
  if (!meta) return bad('Unknown upload session.')
  const received = await readReceived(userId, uploadId)
  if (received.length !== meta.totalChunks) {
    return NextResponse.json(
      { error: 'Incomplete upload.', received },
      { status: 409 },
    )
  }

  // A completed file is one upload: same hourly quota as single-shot.
  const quota = await checkRateLimitForKey(
    buildRateLimitKey('upload:user', userId),
    { max: 40, windowMs: 3_600_000, policy: 'fail-closed' },
  )
  if (!quota.ok) return bad('Too many uploads. Try again later.', 429)

  let buffer: Buffer
  try {
    buffer = await assembleSession(userId, uploadId, meta.totalChunks)
  } catch {
    return bad('Missing chunks. Resume the upload.')
  }
  if (buffer.byteLength === 0) return bad('Empty file.', 400)
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    await destroySession(userId, uploadId)
    return bad('File too large (max 50 MB; video 50 MB, audio 25 MB, images 15 MB).', 413)
  }

  try {
    const result = await uploadMedia(supabase, {
      buffer,
      originalFilename: meta.fileName,
      declaredMimeType: meta.mimeType,
      destination: meta.destination,
      contentItemId: meta.contentItemId,
      uploadedBy: userId,
      durationSeconds: meta.durationSeconds,
    })
    await destroySession(userId, uploadId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof StorageValidationError) {
      return bad(err.message, 422)
    }
    logger.error('uploads/chunk', 'Assembled upload failed', {
      error: err instanceof Error ? err.message : String(err),
      clientIp: ip,
    })
    return bad('Upload failed.', 500)
  }
}

async function getAuthedContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

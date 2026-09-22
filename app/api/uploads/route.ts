import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { assertUploadAccess } from '@/lib/uploads/server'
import { checkRateLimitForKey, buildRateLimitKey, resolveClientIpFromRequest } from '@/lib/security/rate-limit'
import { uploadMedia } from '@/lib/storage/upload'
import { logger } from '@/lib/observability/logger'
import { StorageValidationError } from '@/lib/storage/types'
import type { StorageDestination } from '@/lib/storage/types'

// Basic in-memory rate limit (per-IP, best-effort on single instance).
// For multi-instance production, move this to Redis/Upstash.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const hits = new Map<string, { count: number; resetAt: number }>();

/**
 * D2 (audit): this Map is keyed by attacker-controlled IPs and previously grew
 * without bound under IP rotation (botnet / IPv6) — an entry only leaves when
 * the same IP returns after expiry. Prune expired entries once the map reaches
 * the cap, then drop the oldest half (Map preserves insertion order) so a
 * flood cannot pin memory on a single instance. Live IPs simply re-enter on
 * their next request.
 */
const MAX_TRACKED_IPS = 10_000;

function pruneHits(now: number): void {
    if (hits.size < MAX_TRACKED_IPS) return;
    for (const [key, entry] of hits) {
        if (now > entry.resetAt) hits.delete(key);
        if (hits.size < MAX_TRACKED_IPS) return;
    }
    let dropped = 0;
    const target = Math.ceil(MAX_TRACKED_IPS / 2);
    for (const key of hits.keys()) {
        hits.delete(key);
        if (++dropped >= target) break;
    }
}

function rateLimited(ip: string): boolean {
    const now = Date.now();
    pruneHits(now);
    const entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
        hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
}

export async function POST(request: Request) {
  // Phase 0 — trusted-proxy IP (not xff.split(',')[0], which the client can
  // forge to rotate the throttle key).
  const ip = resolveClientIpFromRequest(request);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  const { supabase, user } = await getAuthedContext()

  const form = await request.formData()
  const file = form.get('file')
  const destinationRaw = form.get('destination')
  const contentItemRaw = form.get('contentItemId')
  const durationRaw = form.get('durationSeconds')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
  }

  const destination = destinationRaw as StorageDestination
  const rawItemId = typeof contentItemRaw === 'string' ? contentItemRaw.trim() : null
  // Shared session authorization with the chunked route (one rule, no
  // drift): auth, staff-only admin_asset (bucket policies in migration
  // 20260907000000 are the backstop), ownership + writable state. A
  // non-empty ID that matches nothing is rejected (400) so typos can't
  // silently create orphaned storage objects; omitting contentItemId is
  // allowed for new-submission flows and covered by the per-user quota below.
  const access = await assertUploadAccess(supabase, user, destination, rawItemId || null)
  // assertUploadAccess rejects null users with 401, so user is set below.
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  if (!access.ok) {
    if (access.status === 500) {
      logger.error('uploads', 'Ownership lookup failed', { clientIp: ip })
    }
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Durable per-IP limiter (multi-instance safe; migration 20260918000000),
  // layered over the in-memory per-IP limiter above. The in-memory check
  // fails fast without a DB round-trip; this one holds across instances.
  const perIp = await checkRateLimitForKey(
    buildRateLimitKey('upload:ip', ip.slice(0, 64)),
    { max: 40, windowMs: 60_000, policy: 'fail-closed' },
  )
  if (!perIp.ok) {
    return NextResponse.json(
      { error: 'Too many uploads. Try again later.' },
      { status: 429 },
    )
  }

  // Durable per-user quota (multi-instance safe; migration 20260918000000),
  // layered on the in-memory per-IP limiter above. An authenticated flood of
  // distinct IPs still hits this.
  const perUser = await checkRateLimitForKey(
    buildRateLimitKey('upload:user', user.id),
    { max: 40, windowMs: 3_600_000, policy: 'fail-closed' },
  )
  if (!perUser.ok) {
    return NextResponse.json(
      { error: 'Too many uploads. Try again later.' },
      { status: 429 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Empty file.' }, { status: 400 })
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50 MB; video 50 MB, audio 25 MB, images 15 MB).' }, { status: 413 })
  }

  try {
    const parsedDuration = typeof durationRaw === 'string' ? Number(durationRaw) : NaN
    const result = await uploadMedia(supabase, {
      buffer,
      originalFilename: file.name,
      declaredMimeType: file.type,
      destination,
      contentItemId: rawItemId,
      uploadedBy: user.id,
      durationSeconds: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof StorageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    logger.error('uploads', 'Upload failed', { error: err instanceof Error ? err.message : String(err), clientIp: ip })
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}

async function getAuthedContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRoles, isStaffRoles } from '@/lib/auth/roles'
import { checkRateLimitForKey, buildRateLimitKey } from '@/lib/security/rate-limit'
import { uploadMedia } from '@/lib/storage/upload'
import { logger } from '@/lib/observability/logger'
import { StorageValidationError } from '@/lib/storage/types'
import type { StorageDestination } from '@/lib/storage/types'

// Basic in-memory rate limit (per-IP, best-effort on single instance).
// For multi-instance production, move this to Redis/Upstash.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
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
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  const { supabase, user } = await getAuthedContext()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const destinationRaw = form.get('destination')
  const contentItemId = form.get('contentItemId')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file.' }, { status: 400 })
  }

  const destination = destinationRaw as StorageDestination
  if (destination !== 'public_photo' && destination !== 'admin_asset') {
    return NextResponse.json({ error: 'Invalid destination.' }, { status: 400 })
  }

  // admin_asset is the Supabase Storage CMS bucket — staff only. The bucket's
  // storage policies enforce this too (migration 20260907000000); the route
  // check keeps the rule visible and fails fast with a clear status.
  const roles = await getUserRoles(supabase, user.id)
  const isStaff = isStaffRoles(roles)

  if (destination === 'admin_asset' && !isStaff) {
    return NextResponse.json(
      { error: 'Staff access required for this destination.' },
      { status: 403 },
    )
  }

  // Content item ownership + writable-state validation: if attaching to an
  // existing item, the caller must own it (or be staff) and the item must be
  // in a writable state (draft/pending). A non-empty ID that matches nothing
  // is rejected (400) so typos can't silently create orphaned storage objects;
  // omitting contentItemId is allowed for new-submission flows and is covered
  // by the per-user quota below.
  const rawItemId = typeof contentItemId === 'string' ? contentItemId.trim() : null
  if (rawItemId) {
    const { data: item, error: itemError } = await supabase
      .from('content_items')
      .select('id, author_id, submitted_by, status')
      .eq('id', rawItemId)
      .maybeSingle()

    if (itemError) {
      logger.error('uploads', 'Ownership lookup failed', { error: itemError.message, clientIp: ip })
      return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
    }
    if (!item) {
      return NextResponse.json(
        { error: 'Unknown content item reference.' },
        { status: 400 },
      )
    }
    const WRITABLE_STATES = new Set(['draft', 'pending'])
    const isOwner = item.author_id === user.id || item.submitted_by === user.id
    if ((!isOwner && !isStaff) || (!WRITABLE_STATES.has(item.status) && !isStaff)) {
      return NextResponse.json(
        { error: 'You do not have permission to attach media to this item.' },
        { status: 403 },
      )
    }
  }

  // Durable per-IP limiter (multi-instance safe; migration 20260918000000),
  // layered over the in-memory per-IP limiter above. The in-memory check
  // fails fast without a DB round-trip; this one holds across instances.
  const perIp = await checkRateLimitForKey(
    buildRateLimitKey('upload:ip', ip.slice(0, 64)),
    { max: 40, windowMs: 60_000 },
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
    { max: 40, windowMs: 3_600_000 },
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
    return NextResponse.json({ error: 'File too large (max 12 MB).' }, { status: 413 })
  }

  try {
    const result = await uploadMedia(supabase, {
      buffer,
      originalFilename: file.name,
      declaredMimeType: file.type,
      destination,
      contentItemId: typeof contentItemId === 'string' ? contentItemId : null,
      uploadedBy: user.id,
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

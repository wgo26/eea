import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadMedia } from '@/lib/storage/upload'
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
    console.error('Upload failed:', err)
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

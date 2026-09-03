import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadMedia } from '@/lib/storage/upload'
import { StorageValidationError } from '@/lib/storage/types'
import type { StorageDestination } from '@/lib/storage/types'

// TODO before production: rate-limit this route (see the auth hardening
// runbook's list of endpoints needing stricter limits) and add CAPTCHA on
// the anonymous submission path — this handler only covers the storage
// side of the flow, not abuse prevention.
export async function POST(request: Request) {
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

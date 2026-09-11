import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserRoles, isStaffRoles } from '@/lib/auth/roles'

/**
 * Staff-only media library search backing the admin MediaPicker (G5):
 * paginated media_assets grid with text search + kind filter.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }
  const roles = await getUserRoles(supabase, user.id)
  if (!isStaffRoles(roles)) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const kind = searchParams.get('kind') ?? 'all'
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(48, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '24', 10) || 24))

  let query = supabase
    .from('media_assets')
    .select('id, public_url, mime_type, file_size_bytes, kind, width, height, provider, duration_seconds', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  if (kind !== 'all') query = query.eq('kind', kind)
  if (q) query = query.or(`storage_key.ilike.%${q}%,public_url.ilike.%${q}%`)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data ?? [], total: count ?? 0 })
}
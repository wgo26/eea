import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Reverse-geocode a browser position into a *proper* location reference.
 *
 * GET /api/locations/reverse?lat=..&lng=..
 * → { displayName, locationId, locationName }
 *
 * The submit form's "Use my location" button calls this instead of writing
 * raw "lat, lng" into the location field: the coordinates are resolved
 * server-side (Nominatim, with a proper User-Agent) and matched against the
 * canonical `locations` table, so the submission links to a real location
 * row when one exists. Public input never creates location rows — an
 * unmatched position returns the human-readable place name (kept as free
 * text for editors) plus the coords, never a bare coordinate placeholder.
 *
 * Same-origin by design: the browser never calls the geocoder directly, so
 * no extra CSP connect-src entry is needed.
 */

type NominatimAddress = Record<string, string | undefined>

type NominatimReverse = {
  display_name?: string
  address?: NominatimAddress
}

function pickAddressName(address: NominatimAddress): string | null {
  const ordered = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.county,
    address.state,
    address.region,
    address.country,
  ]
  const parts = ordered.filter((part): part is string => Boolean(part && part.trim()))
  // City + country reads best ("Douala, Cameroon"); fall back to whatever exists.
  if (parts.length === 0) return null
  const head = parts[0]
  const tail = parts[parts.length - 1]
  return head === tail ? head : `${head}, ${tail}`
}

function matchCandidates(address: NominatimAddress): string[] {
  const raw = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.suburb,
    address.county,
    address.state,
    address.country,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    const name = entry?.trim()
    if (!name || name.length < 2 || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name.slice(0, 80))
  }
  return out.slice(0, 4)
}

async function reverseGeocode(lat: number, lng: number): Promise<NominatimReverse | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}` +
      `&zoom=10&addressdetails=1`
    const res = await fetch(url, {
      headers: {
        // Nominatim usage policy requires an identifying User-Agent.
        'User-Agent': 'EagleEyeAfrica/1.0 (community submissions)',
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as NominatimReverse
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 })
  }

  const geo = await reverseGeocode(lat, lng)
  const address = geo?.address ?? {}
  const displayName = pickAddressName(address) ?? (typeof geo?.display_name === 'string' ? geo.display_name.slice(0, 120) : null)

  let locationId: string | null = null
  let locationName: string | null = null

  const candidates = matchCandidates(address)
  if (candidates.length > 0) {
    try {
      const supabase = createAdminClient()
      for (const candidate of candidates) {
        const { data } = await supabase
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .ilike('name', `%${candidate}%`)
          .order('name')
          .limit(1)
          .maybeSingle()
        const row = data as { id: string; name: string } | null
        if (row?.id) {
          locationId = row.id
          locationName = row.name
          break
        }
      }
    } catch {
      // Geocoder answered but the locations lookup failed: still return the
      // human-readable name so the form keeps a proper place reference.
    }
  }

  return NextResponse.json({ displayName, locationId, locationName })
}

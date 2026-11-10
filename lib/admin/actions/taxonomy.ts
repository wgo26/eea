'use server'

import { revalidateTag } from 'next/cache'
import { assertAdmin, assertCapability, type AdminContext } from '@/lib/admin/auth'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { type UpdateOf } from '@/lib/supabase/admin'
import { type ActionResult, audit, fail, revalidateLocalized, revalidatePublicContentCache, slugify } from './_shared'

/* ------------------------------------------------------------------ */
/* Taxonomy & places (Phase 1 command center)                          */
/* ------------------------------------------------------------------ */

const TAXONOMY_CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture'] as const

/** Slugs are URL-safe lowercase: everything else is rejected, not mangled. */
function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80
}

function revalidateTaxonomy() {
  revalidateLocalized('/admin/taxonomy')
  revalidateLocalized('/admin/moderation/[id]')
  // Category/location renames surface on cached public news cards and facets.
  revalidatePublicContentCache()
  revalidateTag(CACHE_TAGS.locations, 'max')
}

/** Create a category with its English (+ optional French) name. */
export async function createCategory(input: {
  contentType: string
  slug?: string
  nameEn: string
  nameFr?: string
  descriptionEn?: string
  descriptionFr?: string
  sortOrder?: number
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const contentType = input.contentType.trim()
    if (!(TAXONOMY_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return { ok: false, error: 'Unknown content type.' }
    }
    const nameEn = input.nameEn.trim()
    if (!nameEn) return { ok: false, error: 'An English name is required.' }
    const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(nameEn)) || ''
    if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
    const nameFr = input.nameFr?.trim() || null

    const { data: clash } = await supabase
      .from('categories')
      .select('id')
      .eq('content_type', contentType)
      .eq('slug', slug)
      .limit(1)
    if (clash?.length) return { ok: false, error: 'This type already has a category with that slug.' }

    const { data: created, error } = await supabase
      .from('categories')
      .insert({
        content_type: contentType,
        slug,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
      })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: error?.message ?? 'Could not create the category.' }

    const rows = [
      { category_id: created.id, locale: 'en', name: nameEn, description: input.descriptionEn?.trim() || null },
      ...(nameFr ? [{ category_id: created.id, locale: 'fr', name: nameFr, description: input.descriptionFr?.trim() || null }] : []),
    ]
    const { error: transErr } = await supabase.from('category_translations').insert(rows)
    if (transErr) return { ok: false, error: transErr.message }

    await audit(supabase, user.id, { action: 'taxonomy:category:create', notes: `${contentType}/${slug}` })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Rename / reorder / toggle a category. Slugs stay editable — category links
 *  are filter params, never canonical URLs, so renames break nothing indexed. */
export async function updateCategory(
  categoryId: string,
  input: {
    slug?: string
    contentType?: string
    nameEn?: string
    nameFr?: string | null
    descriptionEn?: string | null
    descriptionFr?: string | null
    sortOrder?: number
    isActive?: boolean
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase
      .from('categories')
      .select('id, slug, content_type')
      .eq('id', categoryId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string; content_type: string } | undefined
    if (!row) return { ok: false, error: 'Category not found.' }

    const patch: Record<string, unknown> = {}
    if (input.slug !== undefined) {
      const slug = slugify(input.slug.trim())
      if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
      patch.slug = slug
    }
    if (input.contentType !== undefined) {
      const ct = input.contentType.trim()
      if (!(TAXONOMY_CONTENT_TYPES as readonly string[]).includes(ct)) return { ok: false, error: 'Unknown content type.' }
      patch.content_type = ct
    }
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
    if (input.isActive !== undefined) patch.is_active = input.isActive

    const targetType = (patch.content_type as string | undefined) ?? row.content_type
    const targetSlug = (patch.slug as string | undefined) ?? row.slug
    if (patch.slug !== undefined || patch.content_type !== undefined) {
      const { data: clash } = await supabase
        .from('categories')
        .select('id')
        .eq('content_type', targetType)
        .eq('slug', targetSlug)
        .neq('id', categoryId)
        .limit(1)
      if (clash?.length) return { ok: false, error: 'This type already has a category with that slug.' }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('categories').update(patch as UpdateOf<'categories'>).eq('id', categoryId)
      if (error) return { ok: false, error: error.message }
    }

    if (input.nameEn !== undefined || input.descriptionEn !== undefined) {
      const nameEn = input.nameEn?.trim()
      if (input.nameEn !== undefined && !nameEn) return { ok: false, error: 'An English name is required.' }
      const { error } = await supabase.from('category_translations').upsert(
        {
          category_id: categoryId,
          locale: 'en',
          name: nameEn ?? targetSlug,
          description: input.descriptionEn?.trim() || null,
        },
        { onConflict: 'category_id,locale' },
      )
      if (error) return { ok: false, error: error.message }
    }
    if (input.nameFr !== undefined || input.descriptionFr !== undefined) {
      const nameFr = input.nameFr?.trim() || null
      if (nameFr) {
        const { error } = await supabase.from('category_translations').upsert(
          {
            category_id: categoryId,
            locale: 'fr',
            name: nameFr,
            description: input.descriptionFr?.trim() || null,
          },
          { onConflict: 'category_id,locale' },
        )
        if (error) return { ok: false, error: error.message }
      } else {
        await supabase.from('category_translations').delete().eq('category_id', categoryId).eq('locale', 'fr')
      }
    }

    await audit(supabase, user.id, {
      action: 'taxonomy:category:update',
      notes: `${row.content_type}/${row.slug} → ${targetType}/${targetSlug}`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a category (admin only). Items must be reassigned first — pass
 *  reassignToId to move them in the same step, otherwise the delete is
 *  blocked with the live usage count. */
export async function deleteCategory(categoryId: string, reassignToId?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: current } = await supabase
      .from('categories')
      .select('id, slug, content_type')
      .eq('id', categoryId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string; content_type: string } | undefined
    if (!row) return { ok: false, error: 'Category not found.' }

    const { count } = await supabase
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
    const usage = count ?? 0

    if (usage > 0) {
      if (!reassignToId) {
        return { ok: false, error: `Cannot delete: ${usage} content item${usage === 1 ? '' : 's'} still use${usage === 1 ? 's' : ''} this category. Reassign them first.` }
      }
      if (reassignToId === categoryId) return { ok: false, error: 'Reassign to a different category.' }
      const { data: target } = await supabase
        .from('categories')
        .select('id, content_type')
        .eq('id', reassignToId)
        .limit(1)
      const targetRow = (target ?? [])[0] as { id: string; content_type: string } | undefined
      if (!targetRow) return { ok: false, error: 'Reassignment target not found.' }
      if (targetRow.content_type !== row.content_type) {
        return { ok: false, error: 'Reassign to a category of the same content type.' }
      }
    }

    const { error } = await supabase.rpc('admin_delete_category', {
      p_category_id: categoryId,
      // The RPC treats a null uuid as "no reassignment"; pg_proc cannot
      // express that nullability, so the generated Args type is non-null.
      p_reassign_to: (reassignToId ?? null) as unknown as string,
      p_actor_id: user.id,
    })
    if (error) return { ok: false, error: error.message }
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Create a location (place hub + content geography). Slug auto-derives.
 * Writes both EN and FR rows into location_translations so the place is
 * bilingual from day one. `name` is the English name; `nameFr` the French. */
export async function createLocation(input: {
  name: string
  nameFr?: string
  slug?: string
  locationType?: string
  locationTypeId?: string | null
  description?: string
  descriptionFr?: string
  latitude?: number | null
  longitude?: number | null
  parentId?: string | null
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'A name is required.' }
    const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(name)) || ''
    if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }

    const { data: clash } = await supabase.from('locations').select('id').eq('slug', slug).limit(1)
    if (clash?.length) return { ok: false, error: 'A location with that slug already exists.' }

    const parentId: string | null = input.parentId ?? null
    if (parentId) {
      const { data: parent } = await supabase.from('locations').select('id').eq('id', parentId).limit(1)
      if (!parent?.length) return { ok: false, error: 'Parent location not found.' }
    }

    const locationTypeId: string | null = input.locationTypeId ?? null
    if (locationTypeId) {
      const { data: type } = await supabase.from('location_types').select('id').eq('id', locationTypeId).limit(1)
      if (!type?.length) return { ok: false, error: 'Location type not found.' }
    }

    const { data: created, error } = await supabase.from('locations').insert({
      name,
      slug,
      locale: 'en',
      location_type: input.locationType?.trim() || null,
      location_type_id: locationTypeId,
      description: input.description?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      parent_id: parentId,
      is_active: input.isActive ?? true,
    }).select('id').single()
    if (error || !created) return { ok: false, error: error?.message ?? 'Could not create the location.' }

    const nameFr = input.nameFr?.trim() || null
    const descriptionFr = input.descriptionFr?.trim() || null
    const transRows = [
      { location_id: created.id, locale: 'en', name, description: input.description?.trim() || null },
      ...(nameFr ? [{ location_id: created.id, locale: 'fr', name: nameFr, description: descriptionFr }] : []),
    ]
    const { error: transErr } = await supabase.from('location_translations').insert(transRows)
    if (transErr) return { ok: false, error: transErr.message }

    await audit(supabase, user.id, { action: 'taxonomy:location:create', notes: slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Walk up the parent chain to reject hierarchy cycles. */
async function locationCreatesCycle(
  supabase: AdminContext['supabase'],
  locationId: string,
  newParentId: string,
): Promise<boolean> {
  let cursor: string | null = newParentId
  for (let i = 0; i < 10; i++) {
    if (cursor === locationId) return true
    if (!cursor) return false
    const { data } = await supabase.from('locations').select('parent_id').eq('id', cursor).limit(1)
    const row = (data ?? [])[0] as { parent_id: string | null } | undefined
    if (!row) return false
    cursor = row.parent_id
  }
  return true
}

/** Edit a location. Slug renames preserve the old public URL as a redirect.
 * Writes / upserts both EN and FR translation rows. */
export async function updateLocation(
  locationId: string,
  input: {
    name?: string
    nameFr?: string | null
    slug?: string
    locationType?: string | null
    locationTypeId?: string | null
    description?: string | null
    descriptionFr?: string | null
    latitude?: number | null
    longitude?: number | null
    parentId?: string | null
    isActive?: boolean
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase
      .from('locations')
      .select('id, name, slug')
      .eq('id', locationId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; name: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location not found.' }

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) return { ok: false, error: 'A name is required.' }
      patch.name = name
    }
    if (input.slug !== undefined) {
      const slug = slugify(input.slug.trim())
      if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
      patch.slug = slug
    }
    if (patch.slug !== undefined && patch.slug !== row.slug) {
      const { data: clash } = await supabase
        .from('locations')
        .select('id')
        .eq('slug', patch.slug as string)
        .neq('id', locationId)
        .limit(1)
      if (clash?.length) return { ok: false, error: 'A location with that slug already exists.' }
    }
    if (input.locationType !== undefined) patch.location_type = input.locationType?.trim() || null
    if (input.locationTypeId !== undefined) {
      const locationTypeId: string | null = input.locationTypeId
      if (locationTypeId) {
        const { data: type } = await supabase.from('location_types').select('id').eq('id', locationTypeId).limit(1)
        if (!type?.length) return { ok: false, error: 'Location type not found.' }
      }
      patch.location_type_id = locationTypeId
    }
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.latitude !== undefined) patch.latitude = input.latitude
    if (input.longitude !== undefined) patch.longitude = input.longitude
    if (input.isActive !== undefined) patch.is_active = input.isActive
    if (input.parentId !== undefined) {
      if (input.parentId === locationId) return { ok: false, error: 'A location cannot be its own parent.' }
      if (input.parentId && (await locationCreatesCycle(supabase, locationId, input.parentId))) {
        return { ok: false, error: 'That parent would create a cycle.' }
      }
      if (input.parentId) {
        const { data: parent } = await supabase.from('locations').select('id').eq('id', input.parentId).limit(1)
        if (!parent?.length) return { ok: false, error: 'Parent location not found.' }
      }
      patch.parent_id = input.parentId
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('locations').update(patch as UpdateOf<'locations'>).eq('id', locationId)
      if (error) return { ok: false, error: error.message }
    }

    // Translations: upsert EN + FR, deleting FR when cleared to null.
    const nameEn = input.name !== undefined ? input.name.trim() : null
    const nameFr = input.nameFr !== undefined ? (input.nameFr?.trim() || null) : null
    const descEn = input.description !== undefined ? (input.description?.trim() || null) : null
    const descFr = input.descriptionFr !== undefined ? (input.descriptionFr?.trim() || null) : null

    if (nameEn !== null || descEn !== null) {
      const { error } = await supabase.from('location_translations').upsert({
        location_id: locationId,
        locale: 'en',
        name: nameEn ?? row.name,
        description: descEn ?? null,
      }, { onConflict: 'location_id,locale' })
      if (error) return { ok: false, error: error.message }
    }
    if (nameFr !== null || descFr !== null) {
      if (nameFr) {
        const { error } = await supabase.from('location_translations').upsert({
          location_id: locationId,
          locale: 'fr',
          name: nameFr,
          description: descFr ?? null,
        }, { onConflict: 'location_id,locale' })
        if (error) return { ok: false, error: error.message }
      } else {
        await supabase.from('location_translations').delete().eq('location_id', locationId).eq('locale', 'fr')
      }
    }

    const newSlug = (patch.slug as string | undefined) ?? row.slug
    if (newSlug !== row.slug) {
      const { error: redirectError } = await supabase.from('location_slug_redirects').upsert({
        location_id: locationId,
        old_slug: row.slug,
        created_by: user.id,
      }, { onConflict: 'old_slug' })
      if (redirectError) return { ok: false, error: redirectError.message }
    }
    await audit(supabase, user.id, {
      action: 'taxonomy:location:update',
      entityType: 'location',
      entityId: locationId,
      notes: newSlug === row.slug ? row.slug : `slug: ${row.slug} → ${newSlug} (redirect created)`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a location (admin only). Content + profiles must be reassigned first
 *  (pass reassignToId to move both in one step); businesses are unlinked and
 *  child locations become top-level. */
export async function deleteLocation(locationId: string, reassignToId?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: current } = await supabase
      .from('locations')
      .select('id, name, slug')
      .eq('id', locationId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; name: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location not found.' }

    const [{ count: contentCount }, { count: profileCount }] = await Promise.all([
      supabase.from('content_items').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    ])
    const usage = (contentCount ?? 0) + (profileCount ?? 0)

    if (usage > 0) {
      if (!reassignToId) {
        return {
          ok: false,
          error: `Cannot delete: ${contentCount ?? 0} content item${(contentCount ?? 0) === 1 ? '' : 's'} and ${profileCount ?? 0} profile${(profileCount ?? 0) === 1 ? '' : 's'} still use this location. Reassign them first.`,
        }
      }
      if (reassignToId === locationId) return { ok: false, error: 'Reassign to a different location.' }
      const { data: target } = await supabase.from('locations').select('id').eq('id', reassignToId).limit(1)
      if (!target?.length) return { ok: false, error: 'Reassignment target not found.' }
    }

    const { error } = await supabase.rpc('admin_delete_location', {
      p_location_id: locationId,
      // See admin_delete_category: null uuid means "reassign nothing".
      p_reassign_to: (reassignToId ?? null) as unknown as string,
      p_actor_id: user.id,
    })
    if (error) return { ok: false, error: error.message }
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Fetch all location slug redirects for administrative review. */
export async function getLocationRedirects(): Promise<{
  ok: boolean
  error?: string
  redirects?: Array<{
    id: string
    old_slug: string
    created_at: string
    location_id: string
    location_name: string
    location_slug: string
  }>
}> {
  try {
    const { supabase } = await assertCapability('manageContent')
    const { data, error } = await supabase
      .from('location_slug_redirects')
      .select('id, old_slug, created_at, location_id, locations(name, slug)')
      .order('created_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    const redirects = ((data ?? []) as unknown as Array<{
      id: string
      old_slug: string
      created_at: string
      location_id: string
      locations: { name: string; slug: string } | null
    }>).map((row) => ({
      id: row.id,
      old_slug: row.old_slug,
      created_at: row.created_at,
      location_id: row.location_id,
      location_name: row.locations?.name ?? 'Unknown',
      location_slug: row.locations?.slug ?? '',
    }))
    return { ok: true, redirects }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a location slug redirect (admin/staff). */
export async function deleteLocationRedirect(redirectId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase
      .from('location_slug_redirects')
      .select('id, old_slug, location_id')
      .eq('id', redirectId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; old_slug: string; location_id: string } | undefined
    if (!row) return { ok: false, error: 'Redirect not found.' }

    const { error } = await supabase.from('location_slug_redirects').delete().eq('id', redirectId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, {
      action: 'taxonomy:location_redirect:delete',
      notes: `old_slug=${row.old_slug}`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Location types (tier registry: continent, country, region, …)     */
/* ------------------------------------------------------------------ */

/** Create a location tier (continent, country, region, division, …). */
export async function createLocationType(input: {
  slug: string
  nameEn: string
  nameFr: string
  icon?: string
  color?: string
  sortOrder?: number
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const slug = (input.slug?.trim() ? slugify(input.slug) : '') || ''
    if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
    const nameEn = input.nameEn.trim()
    if (!nameEn) return { ok: false, error: 'An English name is required.' }
    const nameFr = input.nameFr.trim()
    if (!nameFr) return { ok: false, error: 'A French name is required.' }

    const { data: clash } = await supabase.from('location_types').select('id').eq('slug', slug).limit(1)
    if (clash?.length) return { ok: false, error: 'A location type with that slug already exists.' }

    const { error } = await supabase.from('location_types').insert({
      slug,
      name_en: nameEn,
      name_fr: nameFr,
      icon: input.icon?.trim() || null,
      color: input.color?.trim() || null,
      sort_order: input.sortOrder ?? 0,
    })
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'taxonomy:location_type:create', notes: slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Update a location tier. */
export async function updateLocationType(
  typeId: string,
  input: {
    slug?: string
    nameEn?: string
    nameFr?: string | null
    icon?: string | null
    color?: string | null
    sortOrder?: number
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase.from('location_types').select('id, slug').eq('id', typeId).limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location type not found.' }

    const patch: Record<string, unknown> = {}
    if (input.slug !== undefined) {
      const slug = slugify(input.slug.trim())
      if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
      patch.slug = slug
    }
    if (patch.slug !== undefined && patch.slug !== row.slug) {
      const { data: clash } = await supabase.from('location_types').select('id').eq('slug', patch.slug as string).neq('id', typeId).limit(1)
      if (clash?.length) return { ok: false, error: 'A location type with that slug already exists.' }
    }
    if (input.nameEn !== undefined) {
      const nameEn = input.nameEn.trim()
      if (!nameEn) return { ok: false, error: 'An English name is required.' }
      patch.name_en = nameEn
    }
    if (input.nameFr !== undefined) patch.name_fr = input.nameFr.trim() || null
    if (input.icon !== undefined) patch.icon = input.icon?.trim() || null
    if (input.color !== undefined) patch.color = input.color?.trim() || null
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('location_types').update(patch as UpdateOf<'location_types'>).eq('id', typeId)
      if (error) return { ok: false, error: error.message }
    }

    await audit(supabase, user.id, { action: 'taxonomy:location_type:update', notes: row.slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a location type (admin only). Blocked while locations reference it. */
export async function deleteLocationType(typeId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: current } = await supabase.from('location_types').select('id, slug').eq('id', typeId).limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location type not found.' }

    const { count } = await supabase.from('locations').select('id', { count: 'exact', head: true }).eq('location_type_id', typeId)
    if ((count ?? 0) > 0) {
      return { ok: false, error: `Cannot delete: ${count} location${(count ?? 0) === 1 ? '' : 's'} still use this type.` }
    }

    const { error } = await supabase.from('location_types').delete().eq('id', typeId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'taxonomy:location_type:delete', notes: row.slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Location tags (independent place tagging)                         */
/* ------------------------------------------------------------------ */

/** Create a location tag (market, historical, fondom, …). */
export async function createLocationTag(input: {
  slug: string
  nameEn: string
  nameFr: string
  color?: string
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const slug = (input.slug?.trim() ? slugify(input.slug) : '') || ''
    if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
    const nameEn = input.nameEn.trim()
    if (!nameEn) return { ok: false, error: 'An English name is required.' }
    const nameFr = input.nameFr.trim()
    if (!nameFr) return { ok: false, error: 'A French name is required.' }

    const { data: clash } = await supabase.from('location_tags').select('id').eq('slug', slug).limit(1)
    if (clash?.length) return { ok: false, error: 'A location tag with that slug already exists.' }

    const { error } = await supabase.from('location_tags').insert({
      slug,
      name_en: nameEn,
      name_fr: nameFr,
      color: input.color?.trim() || null,
    })
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'taxonomy:location_tag:create', notes: slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Update a location tag. */
export async function updateLocationTag(
  tagId: string,
  input: {
    slug?: string
    nameEn?: string
    nameFr?: string | null
    color?: string | null
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase.from('location_tags').select('id, slug').eq('id', tagId).limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location tag not found.' }

    const patch: Record<string, unknown> = {}
    if (input.slug !== undefined) {
      const slug = slugify(input.slug.trim())
      if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
      patch.slug = slug
    }
    if (patch.slug !== undefined && patch.slug !== row.slug) {
      const { data: clash } = await supabase.from('location_tags').select('id').eq('slug', patch.slug as string).neq('id', tagId).limit(1)
      if (clash?.length) return { ok: false, error: 'A location tag with that slug already exists.' }
    }
    if (input.nameEn !== undefined) {
      const nameEn = input.nameEn.trim()
      if (!nameEn) return { ok: false, error: 'An English name is required.' }
      patch.name_en = nameEn
    }
    if (input.nameFr !== undefined) patch.name_fr = input.nameFr.trim() || null
    if (input.color !== undefined) patch.color = input.color?.trim() || null

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('location_tags').update(patch as UpdateOf<'location_tags'>).eq('id', tagId)
      if (error) return { ok: false, error: error.message }
    }

    await audit(supabase, user.id, { action: 'taxonomy:location_tag:update', notes: row.slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a location tag (admin only). Taggings cascade. */
export async function deleteLocationTag(tagId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: current } = await supabase.from('location_tags').select('id, slug').eq('id', tagId).limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location tag not found.' }

    const { error } = await supabase.from('location_tags').delete().eq('id', tagId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'taxonomy:location_tag:delete', notes: row.slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Tag or untag a location. */
export async function setLocationTag(locationId: string, tagId: string, add: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    if (add) {
      const { error } = await supabase.from('location_taggings').upsert({
        location_id: locationId,
        tag_id: tagId,
      }, { onConflict: 'location_id,tag_id' })
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('location_taggings').delete().eq('location_id', locationId).eq('tag_id', tagId)
      if (error) return { ok: false, error: error.message }
    }

    await audit(supabase, user.id, {
      action: `taxonomy:location_tag:${add ? 'add' : 'remove'}`,
      notes: `location=${locationId} tag=${tagId}`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

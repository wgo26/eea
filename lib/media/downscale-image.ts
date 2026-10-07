'use client'

/** Long-edge cap for client-side downscale (P2 2G-upload hardening). */
export const DOWNSCALE_MAX_EDGE = 1280

/**
 * Redraws oversized raster images to a 1280px long edge (JPEG 0.82) so a
 * multi-MB phone photo uploads in hundreds of KB. Non-images, small images
 * and any failure pass the original file through — compression is strictly
 * best-effort and can never block a submit.
 */
export async function downscaleImageIfNeeded(file: File): Promise<File> {
  if (!file.type.toLowerCase().startsWith('image/')) return file
  if (file.type.toLowerCase() === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= DOWNSCALE_MAX_EDGE) {
      bitmap.close()
      return file
    }
    const scale = DOWNSCALE_MAX_EDGE / longest
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    )
    if (!blob) return file
    // Keep the original stem so alt/caption derivation still works; the
    // server re-validates MIME + magic bytes regardless of extension.
    const stem = file.name.replace(/\.[a-z0-9]+$/i, '') || 'photo'
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

import { storageConfig } from './config'

export interface CloudinaryTransformOptions {
  width?: number
  height?: number
  crop?: 'fill' | 'fit' | 'thumb'
  quality?: 'auto' | number
  format?: 'auto' | 'webp' | 'jpg'
}

/**
 * Cloudinary is deliberately NOT a storage destination (see Section 14 /
 * config.ts) — the original always lives in R2. This wraps R2's public URL
 * with Cloudinary's "fetch" delivery type, so a transformed variant is
 * generated on demand from the existing R2 original rather than uploaded
 * and stored a second time.
 *
 * Only call this where a transform is actually needed (thumbnails, card
 * images, responsive sizes) — full-size detail views can serve the R2 URL
 * directly and skip Cloudinary entirely.
 */
export function getCloudinaryUrl(originalUrl: string, options: CloudinaryTransformOptions = {}): string {
  if (!storageConfig.cloudinary.cloudName) return originalUrl

  const transforms: string[] = []
  if (options.width) transforms.push(`w_${options.width}`)
  if (options.height) transforms.push(`h_${options.height}`)
  if (options.crop) transforms.push(`c_${options.crop}`)
  transforms.push(`q_${options.quality ?? 'auto'}`)
  transforms.push(`f_${options.format ?? 'auto'}`)

  const transformString = transforms.join(',')
  const encodedOriginal = encodeURIComponent(originalUrl)

  return `https://res.cloudinary.com/${storageConfig.cloudinary.cloudName}/image/fetch/${transformString}/${encodedOriginal}`
}

import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Low-bandwidth editorial image. next/image optimizes URLs hosted on our
 * own backends (R2, Supabase, seed placeholders — see next.config.ts
 * remotePatterns) with automatic responsive srcset + AVIF/WebP negotiation;
 * anything else (pasted external URLs, data:) falls back to a plain lazy
 * <img> so approval-time URL pasting can never 400 through the optimizer.
 * Same layout contract either way (fill or fixed size).
 *
 * Callers MUST pass a `sizes` matching the rendered slot (cards ≈ 33-50vw,
 * thumbs ≈ fixed px) — the default 100vw is only correct for full-bleed
 * heroes. Non-priority images are always lazy + async-decoded.
 */

function optimizableHosts(): string[] {
  const hosts = ['picsum.photos'];
  for (const raw of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL]) {
    if (!raw) continue;
    try {
      hosts.push(new URL(raw).hostname);
    } catch {
      /* ignore malformed env */
    }
  }
  return hosts;
}

export function isOptimizableImage(src: string): boolean {
  if (src.startsWith('/')) return true;
  try {
    return optimizableHosts().includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

type SmartImageProps = {
  src: string;
  alt: string;
  className?: string;
  /** Fill the relative parent (default) or render at fixed dimensions. */
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  /**
   * Phase 4 — Save-Data aware quality (1–100, default 75). The AdaptiveImage
   * wrapper drops this to ~35 on metered connections; pass explicitly for
   * fixed low-byte slots (thumbs, rails).
   */
  quality?: number;
};

/**
 * Card-slot sizes: use for grids (3-col desktop → 2-col tablet → 1-col mobile).
 * Keeps next/image srcset from downloading desktop-width bytes on phones.
 */
export const CARD_SIZES = '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw';
/** Fixed-thumbnail slot (rails, next-up rows, thumbs). */
export const THUMB_SIZES = '160px';

/** Drop-in image for editorial surfaces: optimized when possible, plain otherwise. */
export function SmartImage({ src, alt, className, fill = true, width, height, sizes, priority = false, quality }: SmartImageProps) {
  if (!isOptimizableImage(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'low'}
        sizes={sizes ?? (fill ? CARD_SIZES : undefined)}
        className={cn(fill && 'h-full w-full object-cover', className)}
      />
    );
  }
  if (fill) {
    return <Image src={src} alt={alt} fill sizes={sizes ?? CARD_SIZES} priority={priority} quality={quality} className={className} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 400}
      height={height ?? 300}
      sizes={sizes}
      priority={priority}
      quality={quality}
      className={className}
    />
  );
}

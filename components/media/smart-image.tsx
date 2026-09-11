import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * LCP-safe editorial image (P1-3). next/image optimizes URLs hosted on our
 * own backends (R2, Supabase, seed placeholders — see next.config.ts
 * remotePatterns); anything else (pasted external URLs, data:) falls back
 * to a plain lazy <img> so approval-time URL pasting can never 400 through
 * the optimizer. Same layout contract either way (fill or fixed size).
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
};

/** Drop-in image for editorial surfaces: optimized when possible, plain otherwise. */
export function SmartImage({ src, alt, className, fill = true, width, height, sizes, priority = false }: SmartImageProps) {
  if (!isOptimizableImage(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} className={cn(fill && 'h-full w-full object-cover', className)} />;
  }
  if (fill) {
    return <Image src={src} alt={alt} fill sizes={sizes ?? '100vw'} priority={priority} className={className} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 400}
      height={height ?? 300}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}

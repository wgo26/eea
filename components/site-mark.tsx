'use client'

import { Eye } from 'lucide-react'
import { resolveSiteIconUrl } from '@/lib/site-icon'
import { cn } from '@/lib/utils'

type SiteMarkProps = {
  /** `site_logo_url` (admin → Site content). Unset/invalid → built-in eye badge. */
  logoUrl: string | null
  /** Accessible name for the logo image. */
  alt: string
  /** Classes for the fallback badge box. */
  badgeClassName?: string
  /** Classes for the eye icon inside the fallback badge. */
  iconClassName?: string
  /** Classes for the logo image when one is configured. */
  imgClassName?: string
  className?: string
}

/**
 * The brand mark every surface shares: the uploaded app logo when the admin
 * has set `site_logo_url`, otherwise the built-in eye badge. Public header,
 * footer, focused shell (submit/auth) and the admin/account shells all render
 * through this, so "which icon do we show" has exactly one answer. URL safety
 * follows `lib/site-icon` (same rules as the tab icon route).
 */
export function SiteMark({
  logoUrl,
  alt,
  badgeClassName = 'h-9 w-9 rounded-xl',
  iconClassName = 'h-5 w-5',
  imgClassName = 'h-9 w-auto max-w-36 rounded-lg object-contain',
  className,
}: SiteMarkProps) {
  const src = resolveSiteIconUrl(logoUrl)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={cn('shrink-0', imgClassName, className)} />
    )
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground', badgeClassName, className)}
    >
      <Eye className={iconClassName} />
    </span>
  )
}

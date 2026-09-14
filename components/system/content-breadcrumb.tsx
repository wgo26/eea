import { Fragment } from 'react'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { localePath } from '@/lib/i18n/urls'
import type { Locale } from '@/lib/i18n'

export type CrumbTrailItem = {
  label: string
  /** Canonical (unprefixed) path for linked crumbs; omit for the current page. */
  path?: string
}

/**
 * Public content breadcrumb: Home → section → current page. Server-rendered
 * from the dictionary (no hardcoded labels) and locale-prefixed via
 * localePath, so it works in both languages with no bare-href violations.
 */
export function ContentBreadcrumb({
  locale,
  homeLabel,
  trail,
}: {
  locale: Locale
  homeLabel: string
  trail: CrumbTrailItem[]
}) {
  return (
    <Breadcrumb className="no-print mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={localePath(locale, '/')}>{homeLabel}</Link>} />
        </BreadcrumbItem>
        {trail.map((item) => (
          <Fragment key={item.label}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {item.path ? (
                <BreadcrumbLink
                  render={<Link href={localePath(locale, item.path)}>{item.label}</Link>}
                />
              ) : (
                <BreadcrumbPage className="max-w-48 truncate sm:max-w-96">{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

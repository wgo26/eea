import type { ComponentType } from 'react'
import {
  capabilitiesFor,
  type Capability,
} from '@/lib/auth/capabilities'
import type { AppRole } from '@/lib/auth/types'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

/**
 * Single source of the admin navigation (checklist items 5 + 7). Items are
 * filtered through the capability map — an editor never receives the users/
 * ads/storage/audit entries at all, so menus and routes stay in sync. Every
 * href is locale-prefixed (never a bare /admin constant).
 */

type SidebarKey = keyof Dictionary['admin']['sidebar']

export type AdminNavItem = {
  key: SidebarKey
  /** Canonical, locale-free path (used for route matching). */
  path: string
  /** Locale-prefixed href (used for navigation). */
  href: string
  label: string
  icon: ComponentType
  badge?: number
}

type AdminNavItemSpec = {
  key: SidebarKey
  path: string
  capability: Capability
  icon: ComponentType
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function ModerationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function ContentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function AdsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

function StorageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

function AuditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  )
}

function PollIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" />
    </svg>
  )
}

function FundraiserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-2.22-2.07a5.5 5.5 0 0 0-7.78 7.78l2.22 2.22L12 21.23l7.78-7.78 2.22-2.22a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function PolicyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

function SiteContentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function TrustSafetyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function ListingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  )
}

function TaxonomyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />
    </svg>
  )
}

const ADMIN_NAV_SPECS: AdminNavItemSpec[] = [
  { key: 'dashboard', path: '/admin/dashboard', capability: 'viewDashboard', icon: DashboardIcon },
  { key: 'moderation', path: '/admin/moderation', capability: 'moderate', icon: ModerationIcon },
  { key: 'trustSafety', path: '/admin/trust-safety', capability: 'moderate', icon: TrustSafetyIcon },
  { key: 'content', path: '/admin/content', capability: 'manageContent', icon: ContentIcon },
  { key: 'listings', path: '/admin/listings', capability: 'manageContent', icon: ListingsIcon },
  { key: 'taxonomy', path: '/admin/taxonomy', capability: 'manageContent', icon: TaxonomyIcon },
  { key: 'polls', path: '/admin/polls', capability: 'managePolls', icon: PollIcon },
  { key: 'fundraisers', path: '/admin/fundraisers', capability: 'manageFundraisers', icon: FundraiserIcon },
  { key: 'policies', path: '/admin/policies', capability: 'managePolicies', icon: PolicyIcon },
  { key: 'siteContent', path: '/admin/site-content', capability: 'manageSiteContent', icon: SiteContentIcon },
  { key: 'users', path: '/admin/users', capability: 'manageUsers', icon: UsersIcon },
  { key: 'ads', path: '/admin/ads', capability: 'manageAds', icon: AdsIcon },
  { key: 'storage', path: '/admin/storage-backup', capability: 'manageStorage', icon: StorageIcon },
  { key: 'audit', path: '/admin/audit-log', capability: 'viewAuditLog', icon: AuditIcon },
]

/** Locale-prefixed admin entries the given roles may see. */
export function buildAdminNavItems(
  locale: Locale,
  dict: Dictionary,
  roles: AppRole[],
  pendingCount = 0,
): AdminNavItem[] {
  const caps = capabilitiesFor(roles)
  return ADMIN_NAV_SPECS.filter((spec) => caps.has(spec.capability)).map((spec) => ({
    key: spec.key,
    path: spec.path,
    href: localePath(locale, spec.path),
    label: dict.admin.sidebar[spec.key],
    icon: spec.icon,
    badge: spec.key === 'moderation' ? pendingCount : undefined,
  }))
}

export function adminHomeHref(locale: Locale): string {
  return localePath(locale, '/admin/dashboard')
}

export function adminBackToSiteHref(locale: Locale): string {
  return localePath(locale, '/')
}
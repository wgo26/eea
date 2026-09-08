import type { Locale } from '@/lib/i18n'

/**
 * Formatting helpers shared across the admin section. Centralised so every
 * page renders dates, file sizes and prices consistently.
 */

const localeTag: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR' }

export function formatDate(value: string | null | undefined, locale: Locale = 'en'): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(localeTag[locale], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function formatDateTime(value: string | null | undefined, locale: Locale = 'en'): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(localeTag[locale], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function formatRelative(value: string | null | undefined, locale: Locale = 'en'): string {
  if (!value) return '—'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return '—'
  try {
    const diffSec = (Date.now() - then) / 1000
    const abs = Math.abs(diffSec)
    const rtf = new Intl.RelativeTimeFormat(localeTag[locale], { numeric: 'auto' })
    if (abs < 60) return rtf.format(Math.round(diffSec), 'second')
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
    if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day')
    if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month')
    return rtf.format(Math.round(diffSec / 31536000), 'year')
  } catch {
    return '—'
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

export function formatPrice(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return '—'
  const cur = currency ?? 'XAF'
  try {
    return new Intl.NumberFormat(localeTag.en, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${cur}`
  }
}

export function formatPercent(part: number, whole: number): string {
  if (!whole) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

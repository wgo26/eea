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
  const diff = Date.now() - then
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(localeTag[locale], { numeric: 'auto' })
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [2592000, 'day'],
    [31536000, 'month'],
  ]
  for (const [threshold, unit] of units) {
    if (abs < threshold) return rtf.format(Math.round(diff / (threshold / (unit === 'second' ? 1 : unit === 'minute' ? 60 : unit === 'hour' ? 3600 : unit === 'day' ? 86400 : 2592000))), unit)
  }
  return rtf.format(Math.round(diff / 31536000), 'year')
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

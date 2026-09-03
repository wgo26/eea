import { en, type Dictionary } from './en'
import { fr } from './fr'
import type { Locale } from './config'
import { locales, defaultLocale, isLocale, resolveLocale, localeNames, LOCALE_COOKIE } from './config'
import { formatMoney } from '@/lib/format'
const dictionaries: Record<Locale, Dictionary> = { en, fr }

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

export function formatDate(
  date: string | Date,
  locale: Locale,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  }).format(d)
}

export function formatDateTime(date: string | Date, locale: Locale): string {
  return formatDate(date, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatPrice(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
): string {
  return formatMoney(amount, currency, locale)
}

/** Relative time ("3 days ago" / "il y a 3 jours"). */
export function timeAgo(date: string | Date, locale: Locale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  const rtf = new Intl.RelativeTimeFormat(locale === 'fr' ? 'fr' : 'en', { numeric: 'auto' })
  const diffMs = d.getTime() - Date.now()
  const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60 * 1000, unit: 'second' },
    { amount: 60 * 60 * 1000, unit: 'minute' },
    { amount: 24 * 60 * 60 * 1000, unit: 'hour' },
    { amount: 7 * 24 * 60 * 60 * 1000, unit: 'day' },
    { amount: 30 * 24 * 60 * 60 * 1000, unit: 'week' },
    { amount: 365 * 24 * 60 * 60 * 1000, unit: 'month' },
    { amount: Infinity, unit: 'year' },
  ]
  for (const { amount, unit } of divisions) {
    if (Math.abs(diffMs) < amount) {
      return rtf.format(Math.round(diffMs / amount), unit)
    }
  }
  return ''
}

export {
  locales,
  defaultLocale,
  isLocale,
  resolveLocale,
  localeNames,
  LOCALE_COOKIE,
}
export {
  localePath,
  isLocalePrefixed,
  acceptLanguageLocale,
  safeNextPath,
  buildAlternates,
} from './urls'
export type { Locale, Dictionary }

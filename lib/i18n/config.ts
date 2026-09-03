export const locales = ['en', 'fr'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

/** Cookie that persists the visitor's language choice. */
export const LOCALE_COOKIE = 'eea-locale'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale
}

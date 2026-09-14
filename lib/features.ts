import { getPublicSiteSettings } from '@/lib/admin/queries'

/**
 * Feature flags (kill-switches for newer surfaces), stored as
 * `feature_*` site settings and edited at /admin/site-content.
 * Absent rows fall back to the code defaults below (all ON) — the admin
 * UI writes explicit 'false' to turn one off.
 */
export const FEATURE_DEFAULTS = {
  feature_reading_mode: true,
  feature_event_reminders: true,
  feature_text_to_speech: true,
} as const

export type FeatureFlag = keyof typeof FEATURE_DEFAULTS

const SETTING_FIELD: Record<FeatureFlag, 'featureReadingMode' | 'featureEventReminders' | 'featureTextToSpeech'> = {
  feature_reading_mode: 'featureReadingMode',
  feature_event_reminders: 'featureEventReminders',
  feature_text_to_speech: 'featureTextToSpeech',
}

export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  try {
    const settings = await getPublicSiteSettings()
    return settings[SETTING_FIELD[flag]]
  } catch {
    return FEATURE_DEFAULTS[flag]
  }
}

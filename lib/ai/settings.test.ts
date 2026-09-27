import { describe, expect, it } from 'vitest'
import { clearAiSettingsCache, providerHostOf } from './settings'
import { AI_PROVIDER_PRESETS, presetById } from './providers'

describe('providerHostOf', () => {
  it('extracts the host for honest UI labels', () => {
    expect(providerHostOf('https://api.openai.com/v1')).toBe('api.openai.com')
    expect(providerHostOf('https://openrouter.ai/api/v1/')).toBe('openrouter.ai')
    expect(providerHostOf('not a url')).toBe('unconfigured')
  })
})

describe('AI_PROVIDER_PRESETS', () => {
  it('resolves known presets and falls back to OpenAI', () => {
    expect(presetById('groq').baseUrl).toContain('groq.com')
    expect(presetById('nope').id).toBe('openai')
    expect(AI_PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(6)
  })

  it('every preset has an https base or is the custom slot', () => {
    for (const p of AI_PROVIDER_PRESETS) {
      if (p.id === 'custom') continue
      expect(p.baseUrl.startsWith('https://')).toBe(true)
      expect(p.model.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('clearAiSettingsCache', () => {
  it('is safe to call with a cold cache', () => {
    expect(() => clearAiSettingsCache()).not.toThrow()
  })
})

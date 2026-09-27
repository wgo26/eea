/**
 * P5-admin-keys — AI provider presets (client-safe: no secrets, no I/O).
 * Shared by the Secrets setup card and the save action so the preset list
 * can never drift between the picker and the validation.
 */

export type AiProviderPreset = { id: string; label: string; baseUrl: string; model: string }

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { id: 'kilo', label: 'Kilo Gateway', baseUrl: 'https://api.kilo.ai/v1', model: 'gpt-4o-mini' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'gemini', label: 'Google Gemini (OpenAI-compat)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'custom', label: 'Custom OpenAI-compatible endpoint', baseUrl: '', model: 'gpt-4o-mini' },
]

export function presetById(id: string): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find((p) => p.id === id) ?? AI_PROVIDER_PRESETS[0]!
}

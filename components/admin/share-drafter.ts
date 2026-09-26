'use client'

import { draftShareLine } from '@/lib/admin/actions/content'
import { suggestShareText } from '@/lib/content/auto-fill'

type Copy = {
  toastAssisted?: string
  toastTranslated: string
  translateEmpty: string
}

export type ShareDraftInput = {
  /** The item's primary title (en preferred by the caller). */
  title: string
  excerpt: string
  voice: string
  /** Locale the share line targets — follows whichever title exists. */
  locale: 'en' | 'fr'
  /** Deterministic-fallback sources. */
  enExcerpt: string
  enBody: string
}

/**
 * Draft the WhatsApp share line into the form.
 *
 * Tries the intelligent path first — editorial model in the selected voice
 * register (formal / pidgin / camfranglais), DeepL for a formal FR line —
 * and falls back to the deterministic title-based suggestion the form
 * shipped with. Lives outside content-form.tsx to keep that file inside
 * its size ratchet.
 */
export async function draftShareInto(
  input: ShareDraftInput,
  copy: Copy,
  patch: (p: { shareText: string }) => void,
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
): Promise<void> {
  const applyDeterministic = () => {
    const s = suggestShareText(input.title, input.enExcerpt || input.enBody)
    if (!s) {
      addToast(copy.translateEmpty, 'error')
      return
    }
    patch({ shareText: s })
    addToast(copy.toastAssisted ?? copy.toastTranslated, 'success')
  }
  if (!input.title.trim()) {
    applyDeterministic()
    return
  }
  const res = await draftShareLine({
    title: input.title,
    excerpt: input.excerpt,
    voice: input.voice,
    locale: input.locale,
  }).catch(() => null)
  if (res?.ok) {
    patch({ shareText: res.shareText })
    addToast(copy.toastAssisted ?? copy.toastTranslated, 'success')
    return
  }
  applyDeterministic()
}

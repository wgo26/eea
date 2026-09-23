'use client'

import { useState } from 'react'
import { translateContentFields } from '@/lib/admin/actions/content'
import { useToast } from '@/components/admin/toast'

/**
 * Shared auto-translate for bilingual admin editors (content, moderation
 * review, fundraisers): fills the other locale's fields via the
 * DeepL-backed translateContentFields action. The editor reviews the result
 * before saving — nothing is written to the DB.
 */

export type TranslatableFields = {
  title: string
  excerpt: string
  body: string
  seoDescription: string
}

/** Minimal copy surface — any admin section carrying these keys fits. */
export type TranslateCopy = {
  translateEnToFr: string
  translateFrToEn: string
  translating: string
  toastTranslated: string
  translateEmpty: string
}

export function useContentTranslator({
  copy,
  read,
  write,
}: {
  copy: TranslateCopy
  read: () => { en: TranslatableFields; fr: TranslatableFields }
  write: (locale: 'en' | 'fr', fields: TranslatableFields) => void
}) {
  const { addToast } = useToast()
  const [translating, setTranslating] = useState<null | 'en-fr' | 'fr-en'>(null)

  async function translate(dir: 'en-fr' | 'fr-en') {
    if (translating) return
    const src = dir === 'en-fr' ? 'en' : 'fr'
    const source = read()[src]
    if (!source.title.trim() && !source.excerpt.trim() && !source.body.trim() && !source.seoDescription.trim()) {
      addToast(copy.translateEmpty, 'error')
      return
    }
    setTranslating(dir)
    try {
      const res = await translateContentFields({
        sourceLocale: src,
        title: source.title,
        excerpt: source.excerpt,
        body: source.body,
        seoDescription: source.seoDescription,
      })
      if (!res.ok) {
        addToast(res.error, 'error')
        return
      }
      write(src === 'en' ? 'fr' : 'en', res.fields)
      addToast(copy.toastTranslated, 'success')
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setTranslating(null)
    }
  }

  return { translate, translating }
}

export function TranslateButtons({
  copy,
  translate,
  translating,
}: {
  copy: TranslateCopy
  translate: (dir: 'en-fr' | 'fr-en') => void
  translating: null | 'en-fr' | 'fr-en'
}) {
  const busy = translating !== null
  const btn =
    'shrink-0 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => translate('en-fr')} disabled={busy} className={btn}>
        {translating === 'en-fr' ? copy.translating : copy.translateEnToFr}
      </button>
      <button type="button" onClick={() => translate('fr-en')} disabled={busy} className={btn}>
        {translating === 'fr-en' ? copy.translating : copy.translateFrToEn}
      </button>
    </div>
  )
}

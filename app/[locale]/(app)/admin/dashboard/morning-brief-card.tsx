import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { aiMorningBrief } from '@/lib/admin/actions/ai'

/**
 * P5 — morning brief card: the solo operator's 5 moves, above the command
 * center. AI prose when the layer is on, deterministic bullets when off —
 * the badge says which, so offline is never mistaken for intelligence.
 */
export async function MorningBriefCard() {
  const locale = await getRequestLocale()
  const t = getDictionary(locale).admin.dashboard
  let bullets: string[] = []
  let ai = false
  try {
    const res = await aiMorningBrief(locale === 'fr' ? 'fr' : 'en')
    if (res.ok) {
      bullets = res.bullets
      ai = res.ai
    }
  } catch {
    bullets = []
  }
  if (bullets.length === 0) return null
  return (
    <section aria-label={t.morningTitle} className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.morningTitle}</h2>
        <span
          role="status"
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ai ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground'}`}
        >
          {ai ? t.morningAiBadge : t.morningOfflineBadge}
        </span>
      </div>
      <ol className="mt-2 space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2 text-sm">
            <span aria-hidden className="text-primary">→</span>
            <span>{b}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getOpenDigestSlots } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { formatRelative } from '@/lib/admin/format'
import { SlotRowActions, type SlotCopy } from './slot-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.digest.title }
}

const SECTION_LABEL_KEYS = {
  visual: 'sectionVisual',
  community: 'sectionCommunity',
  notices: 'sectionNotices',
  listings: 'sectionListings',
  culture: 'sectionCulture',
} as const

/**
 * Today's digest (Stream A, A4): the live accumulation of the open
 * digest_slots, grouped by issue date + locale, with editor pin/drop —
 * what the 06:00 freeze will send tonight, visible during the day.
 */
export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/digest')
  const dict = getDictionary(locale)
  const t = dict.admin.digest
  const common = dict.admin.common

  const { slots, counts } = await getOpenDigestSlots()

  const groups = new Map<string, typeof slots>()
  for (const slot of slots) {
    const key = `${slot.issueDate}|${slot.locale}`
    const list = groups.get(key) ?? []
    list.push(slot)
    groups.set(key, list)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
      />

      <p className="text-xs text-muted-foreground">
        {t.openCounts.replace('{en}', String(counts.en)).replace('{fr}', String(counts.fr))}
      </p>

      {groups.size === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        [...groups.entries()].map(([key, groupSlots]) => {
          const [issueDate, issueLocale] = key.split('|')
          const open = groupSlots.filter((s) => !s.removed)
          return (
            <section key={key} className="rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-sm font-medium">
                  {issueDate}
                  <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                    {issueLocale === 'fr' ? common.localeFr : common.localeEn}
                  </span>
                </h2>
                <span className="text-xs text-muted-foreground">
                  {t.storyCount.replace('{count}', String(open.length))}
                </span>
              </header>
              {open.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">{t.allDropped}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {open.map((slot, index) => (
                    <li key={slot.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a href={localePath(locale, slot.path)} target="_blank" rel="noreferrer" className="block truncate text-sm text-link hover:underline">
                          {slot.title}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {slot.itemType}
                          {' · '}
                          {t[SECTION_LABEL_KEYS[slot.section as keyof typeof SECTION_LABEL_KEYS] as 'sectionVisual'] ?? slot.section}
                          {slot.fromSubmission ? ` · ${t.fromSubmission}` : ''}
                          {slot.pinned ? ` · ${t.pinned}` : ''}
                          {' · '}
                          {formatRelative(slot.createdAt, locale)}
                        </p>
                      </div>
                      <SlotRowActions
                        slot={{ id: slot.id, pinned: slot.pinned, removed: slot.removed }}
                        copy={t satisfies SlotCopy}
                      />
                    </li>
                  ))}
                  {groupSlots
                    .filter((s) => s.removed)
                    .map((slot) => (
                      <li key={slot.id} className="flex items-start gap-3 px-4 py-2.5 opacity-50">
                        <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-muted-foreground">—</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm line-through">{slot.title}</p>
                          <p className="text-xs text-muted-foreground">{t.dropped}</p>
                        </div>
                        <SlotRowActions
                          slot={{ id: slot.id, pinned: slot.pinned, removed: slot.removed }}
                          copy={t satisfies SlotCopy}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { removeDemoData, type DemoTeardownReport } from '@/lib/admin/actions-demo'
import type { DemoDataCounts } from '@/lib/admin/demo-data'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import { ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['dashboard']

function fill(template: string, n: number): string {
  return template.replace('{n}', String(n))
}

function buildSummary(report: DemoTeardownReport, copy: Copy): string {
  const parts: string[] = []
  if (report.contentItems > 0) parts.push(fill(copy.demoSummaryItems, report.contentItems))
  if (report.polls > 0) parts.push(fill(copy.demoSummaryPolls, report.polls))
  if (report.adSlots > 0) parts.push(fill(copy.demoSummaryAds, report.adSlots))
  if (report.categoriesDeleted + report.locationsDeleted > 0) {
    parts.push(fill(copy.demoSummaryTaxonomy, report.categoriesDeleted + report.locationsDeleted))
  }
  return parts.join(', ')
}

/**
 * Admin-only dashboard card: removes the seeded demo data (the in-app
 * equivalent of scripts/teardown-demo.mjs) so real content can start going
 * in. The sweep itself is scoped server-side to the exact demo identifiers
 * (lib/admin/demo-data.ts) — real rows can never be touched.
 */
export function DemoDataCard({
  copy,
  cancelLabel,
  counts,
}: {
  copy: Copy
  cancelLabel: string
  counts: DemoDataCounts
}) {
  const router = useRouter()
  const { addToast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [working, setWorking] = useState(false)

  const total = counts.contentItems + counts.polls + counts.adSlots

  async function handleRemove() {
    setWorking(true)
    try {
      const result = await removeDemoData()
      if (result.ok) {
        const summary = buildSummary(result.report, copy)
        addToast(summary ? copy.demoToastDone.replace('{summary}', summary) : copy.demoToastNone, 'success')
        setConfirmOpen(false)
        router.refresh()
      } else {
        addToast(result.error, 'error')
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">{copy.demoTitle}</h2>
      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{copy.demoDescription}</p>

      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{copy.demoNone}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-1 text-sm">
            {counts.contentItems > 0 && <li>{fill(copy.demoFound, counts.contentItems)}</li>}
            {counts.polls > 0 && <li>{fill(copy.demoPollsFound, counts.polls)}</li>}
            {counts.adSlots > 0 && <li>{fill(copy.demoAdsFound, counts.adSlots)}</li>}
          </ul>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={working}
            className={`${ui.btnDanger} mt-4`}
          >
            {working ? copy.demoWorking : copy.demoRemove}
          </button>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={copy.demoConfirmTitle}
        description={copy.demoConfirmBody}
        confirmLabel={working ? copy.demoWorking : copy.demoRemove}
        cancelLabel={cancelLabel}
        onConfirm={handleRemove}
        loading={working}
      >
        <p className="text-xs text-muted-foreground">{copy.demoConfirmNote}</p>
      </ConfirmDialog>
    </section>
  )
}

'use client'

import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Check, LayoutGrid, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { EmptyState } from '@/components/admin/empty-state'
import { fillCopy } from '@/lib/admin/format'
import { MAX_WIDGETS, type WidgetId } from '@/lib/admin/widget-layout'
import { resetDashboardLayout, saveDashboardLayout } from '@/lib/admin/actions/widgets'
import type { Dictionary } from '@/lib/i18n'

type Copy = Pick<
  Dictionary['admin']['dashboard'],
  | 'customize'
  | 'customizeDone'
  | 'addWidget'
  | 'moveUp'
  | 'moveDown'
  | 'removeWidget'
  | 'resetLayout'
  | 'layoutSaved'
  | 'layoutResetDone'
  | 'resetTitle'
  | 'resetBody'
  | 'widgetLimit'
  | 'widgetsEmpty'
  | 'noWidgetsAvailable'
>

export type BoardWidget = { id: WidgetId; content: React.ReactNode }
export type BoardCatalogEntry = { id: WidgetId; title: string }

type Intent =
  | { type: 'move'; id: WidgetId; delta: number }
  | { type: 'remove'; id: WidgetId }
  | { type: 'add'; id: WidgetId }

function reduce(order: WidgetId[], intent: Intent): WidgetId[] {
  switch (intent.type) {
    case 'move': {
      const from = order.indexOf(intent.id)
      const to = from + intent.delta
      if (from < 0 || to < 0 || to >= order.length) return order
      const next = [...order]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    }
    case 'remove':
      return order.filter((id) => id !== intent.id)
    case 'add':
      return order.includes(intent.id) ? order : [...order, intent.id]
  }
}

/**
 * §35 widget board. The server renders every widget body (`content`) and this
 * client island only owns the *order*: the optimistic reducer tracks ids, the
 * card elements keep `key={id}`, so add/remove/move rearranges rendered nodes
 * without re-rendering any body. A failed save never revalidates, so the board
 * falls back to the server order on the next render — it can never drift from
 * the stored layout.
 */
export function WidgetBoard({
  widgets,
  catalog,
  copy,
  cancelLabel,
  canEdit = true,
}: {
  widgets: BoardWidget[]
  catalog: BoardCatalogEntry[]
  copy: Copy
  cancelLabel: string
  canEdit?: boolean
}) {
  const { run, loading } = useAdminMutation()
  const [editing, setEditing] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [, startTransition] = useTransition()

  const serverOrder = useMemo(() => widgets.map((w) => w.id), [widgets])
  const [order, applyIntent] = useOptimistic(serverOrder, reduce)

  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets])
  const titleById = useMemo(() => new Map(catalog.map((c) => [c.id, c.title])), [catalog])
  const available = catalog.filter((c) => !order.includes(c.id))
  const atCap = order.length >= MAX_WIDGETS

  function commit(intent: Intent, next: WidgetId[]) {
    startTransition(async () => {
      applyIntent(intent)
      await run(() => saveDashboardLayout(next), copy.layoutSaved)
    })
  }

  function move(id: WidgetId, delta: number) {
    const next = reduce(order, { type: 'move', id, delta })
    if (next === order) return
    commit({ type: 'move', id, delta }, next)
  }

  function remove(id: WidgetId) {
    commit({ type: 'remove', id }, reduce(order, { type: 'remove', id }))
  }

  function add(id: WidgetId) {
    commit({ type: 'add', id }, reduce(order, { type: 'add', id }))
  }

  async function onReset() {
    if (await run(() => resetDashboardLayout(), copy.layoutResetDone)) setResetOpen(false)
  }

  return (
    <section className="space-y-4">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editing && atCap ? (
            <p className="mr-auto text-xs text-muted-foreground">
              {fillCopy(copy.widgetLimit, { max: MAX_WIDGETS })}
            </p>
          ) : null}
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {copy.resetLayout}
              </Button>
              <Button type="button" size="sm" onClick={() => setEditing(false)}>
                <Check className="size-4" aria-hidden="true" />
                {copy.customizeDone}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <LayoutGrid className="size-4" aria-hidden="true" />
              {copy.customize}
            </Button>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {copy.addWidget}
          </p>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.noWidgetsAvailable}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((entry) => (
                <Button
                  key={entry.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || atCap}
                  onClick={() => add(entry.id)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {entry.title}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {order.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8">
          <EmptyState message={copy.widgetsEmpty} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {order.map((id, index) => (
            <article
              key={id}
              className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                <h2 className="flex-1 text-sm font-semibold text-foreground">
                  {titleById.get(id) ?? id}
                </h2>
                {editing ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={copy.moveUp}
                      title={copy.moveUp}
                      disabled={index === 0 || loading}
                      onClick={() => move(id, -1)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={copy.moveDown}
                      title={copy.moveDown}
                      disabled={index === order.length - 1 || loading}
                      onClick={() => move(id, 1)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                    >
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={copy.removeWidget}
                      title={copy.removeWidget}
                      disabled={loading}
                      onClick={() => remove(id)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </header>
              <div className="flex-1 p-4">{byId.get(id)?.content}</div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={copy.resetTitle}
        description={copy.resetBody}
        confirmLabel={copy.resetLayout}
        cancelLabel={cancelLabel}
        loading={loading}
        tone="default"
        onConfirm={onReset}
      />
    </section>
  )
}

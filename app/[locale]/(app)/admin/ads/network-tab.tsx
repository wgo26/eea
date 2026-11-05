'use client'

import { useState } from 'react'

import {
  clearAdSlotNetwork,
  saveAdSlotNetwork,
  toggleAdSlotNetwork,
  updateAdNetworkSettings,
} from '@/lib/admin/actions/ad-networks'
import { AD_NETWORK_PROVIDERS, AD_UNIT_FORMATS } from '@/lib/ads/networks'
import { useAdminMutation } from '@/components/admin/confirm-dialog'
import { DataTable } from '@/components/admin/data-table'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'
import type { AdNetworkSettingsRow, AdSlotNetworkRow } from '@/lib/admin/queries/ad-networks'

type Copy = Dictionary['admin']['ads']

/** Formats → delivery kind, mirroring the parser's default in lib/ads/networks.ts. */
function kindFor(format: string): string {
  if (format === 'adsense') return 'adsense'
  if (format === 'smartlink') return 'link'
  return 'script'
}

/**
 * Remnant-network tab: the global switches plus one tag per placement.
 *
 * These values used to live in `NEXT_PUBLIC_AD_SLOTS`, which is inlined into the
 * client bundle at build time — every tag change meant a rebuild and an operator
 * with SSH access. They are now rows, read on the server (cached, `ads` tag) and
 * handed to the renderer through context, so saving here is live on the next
 * public render.
 */
export function NetworkTab({
  settings,
  rows,
  copy,
}: {
  settings: AdNetworkSettingsRow
  rows: AdSlotNetworkRow[]
  copy: Copy
}) {
  const { run, loading } = useAdminMutation()
  const [form, setForm] = useState(settings)
  const [editing, setEditing] = useState<AdSlotNetworkRow | null>(null)

  async function saveSettings() {
    await run(() => updateAdNetworkSettings(form), copy.networkSavedSettings)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{copy.networkHeading}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{copy.networkIntro}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['networksEnabled', copy.networksEnabled],
              ['consentRequired', copy.consentRequired],
              ['reserveSpace', copy.reserveSpace],
              ['houseAdsEnabled', copy.houseAdsEnabled],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-foreground">{label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{copy.networkCspHint}</p>
        <button
          type="button"
          onClick={saveSettings}
          disabled={loading}
          className={`${ui.btnPrimary} mt-3`}
        >
          {loading ? '…' : copy.networkSaveSettings}
        </button>
      </section>

      <section>
        {rows.length === 0 ? (
          <EmptyState message={copy.emptySlots} />
        ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: 'slot',
              header: copy.colSlot,
              render: (r) => (
                <div className="min-w-[160px] max-w-[240px]">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.slotKey}</div>
                </div>
              ),
            },
            {
              key: 'provider',
              header: copy.colProvider,
              render: (r) => (
                <span className="text-xs whitespace-nowrap">
                  {r.network ? `${r.network} · ${r.format ?? '—'}` : copy.networkNone}
                </span>
              ),
            },
            {
              key: 'tag',
              header: copy.colTag,
              headerClassName: 'hidden lg:table-cell',
              className: 'hidden lg:table-cell',
              render: (r) => (
                <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={r.url ?? ''}>
                  {r.url ?? '—'}
                </span>
              ),
            },
            {
              key: 'status',
              header: copy.colStatus,
              render: (r) =>
                r.url ? (
                  <StatusBadge status={r.networkActive ? 'active' : 'paused'} label={r.networkActive ? copy.active : copy.inactive} />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                ),
            },
            {
              key: 'actions',
              header: '',
              stickyRight: true,
              className: 'text-right',
              render: (r) => (
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setEditing(r)} className={ui.btnSecondary}>
                    {r.url ? copy.networkEdit : copy.networkConfigure}
                  </button>
                </div>
              ),
            },
          ]}
        />
        )}
      </section>

      {editing ? (
        <NetworkEditor
          key={editing.id}
          row={editing}
          copy={copy}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

/** Per-slot tag editor. Everything it collects is re-validated server-side. */
function NetworkEditor({
  row,
  copy,
  onClose,
}: {
  row: AdSlotNetworkRow
  copy: Copy
  onClose: () => void
}) {
  const { run, loading } = useAdminMutation()
  const [network, setNetwork] = useState(row.network ?? 'monetag')
  const [format, setFormat] = useState(row.format ?? 'banner')
  const [url, setUrl] = useState(row.url ?? '')
  const [width, setWidth] = useState(row.width != null ? String(row.width) : '')
  const [height, setHeight] = useState(row.height != null ? String(row.height) : '')
  const [active, setActive] = useState(row.networkActive)
  const [adsenseClient, setAdsenseClient] = useState(row.adsenseClient ?? '')
  const [adsenseSlotId, setAdsenseSlotId] = useState(row.adsenseSlotId ?? '')
  const [adsenseFormat, setAdsenseFormat] = useState(row.adsenseFormat ?? '')
  const [adsenseLayout, setAdsenseLayout] = useState(row.adsenseLayout ?? '')
  const kind = kindFor(format)

  async function save() {
    const ok = await run(
      () =>
        saveAdSlotNetwork({
          slotId: row.id,
          network,
          format,
          kind,
          url,
          width: width.trim() ? Number(width) : null,
          height: height.trim() ? Number(height) : null,
          active,
          adsenseClient: adsenseClient.trim() || null,
          adsenseSlotId: adsenseSlotId.trim() || null,
          adsenseFormat: adsenseFormat.trim() || null,
          adsenseLayout: adsenseLayout.trim() || null,
        }),
      copy.networkSaved,
    )
    if (ok) onClose()
  }

  async function toggle() {
    await run(() => toggleAdSlotNetwork(row.id, !row.networkActive), copy.networkSaved)
  }

  async function clear() {
    const ok = await run(() => clearAdSlotNetwork(row.id), copy.networkCleared)
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.networkEditTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {row.name} · <code>{row.slotKey}</code>
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{copy.networkProvider}</span>
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className={ui.input}>
              {AD_NETWORK_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{copy.networkFormat}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className={ui.input}>
              {AD_UNIT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{copy.networkUrl}</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className={ui.input}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.networkWidth}</span>
              <input type="number" min="1" max="2000" value={width} onChange={(e) => setWidth(e.target.value)} className={ui.input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.networkHeight}</span>
              <input type="number" min="50" max="1200" value={height} onChange={(e) => setHeight(e.target.value)} className={ui.input} />
            </label>
          </div>
          {kind === 'adsense' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.adsenseClient}</span>
                <input value={adsenseClient} onChange={(e) => setAdsenseClient(e.target.value)} placeholder="ca-pub-…" className={ui.input} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.adsenseSlotId}</span>
                <input value={adsenseSlotId} onChange={(e) => setAdsenseSlotId(e.target.value)} className={ui.input} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.adsenseFormatLabel}</span>
                <input value={adsenseFormat} onChange={(e) => setAdsenseFormat(e.target.value)} placeholder="auto" className={ui.input} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.adsenseLayout}</span>
                <input value={adsenseLayout} onChange={(e) => setAdsenseLayout(e.target.value)} placeholder="true" className={ui.input} />
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="font-medium">{copy.networkActive}</span>
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={toggle} disabled={loading || !row.url} className={ui.btnSecondary}>
            {row.networkActive ? copy.pause : copy.activate}
          </button>
          <button type="button" onClick={clear} disabled={loading || !row.url} className={ui.btnSecondary}>
            {copy.networkClear}
          </button>
          <button type="button" onClick={onClose} disabled={loading} className={ui.btnSecondary}>
            {copy.cancel}
          </button>
          <button type="button" onClick={save} disabled={loading || !url.trim()} className={ui.btnPrimary}>
            {loading ? '…' : copy.saved}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
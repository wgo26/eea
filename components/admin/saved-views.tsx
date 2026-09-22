'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { localePath } from '@/lib/i18n/urls'
import type { Locale } from '@/lib/i18n'

type SavedView = {
  name: string
  status: string
  type: string
  search: string
}

type Props = {
  locale: Locale
  params: {
    status: string
    type: string
    search: string | undefined
  }
  copy: {
    viewName: string
    saveView: string
    savedViews: string
    noSavedViews: string
    replaceView: string
    viewKeyConflict: string
  }
}

const STORAGE_KEY = 'eea-admin-content-views'

function readViews(locale: Locale): Record<string, SavedView> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}-${locale}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeViews(locale: Locale, views: Record<string, SavedView>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${STORAGE_KEY}-${locale}`, JSON.stringify(views))
  } catch {}
}

export function SavedViews({ locale, params, copy }: Props) {
  const router = useRouter()
  const [views, setViews] = useState<Record<string, SavedView>>(() => readViews(locale))
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pendingName, setPendingName] = useState('')
  const [saving, setSaving] = useState(false)

  const currentKey = `${params.status}|${params.type}|${params.search ?? ''}`

  const handleSave = useCallback(() => {
    const name = pendingName.trim()
    if (!name) return
    const existing = Object.values(views).find((v) => v.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (window.confirm(copy.replaceView)) {
        const newViews = { ...views }
        delete newViews[existing.name]
        newViews[name] = { name, ...params, search: params.search ?? '' }
        setViews(newViews)
        writeViews(locale, newViews)
      }
    } else {
      const newViews = { ...views, [name]: { name, ...params, search: params.search ?? '' } }
      setViews(newViews)
      writeViews(locale, newViews)
    }
    setSaving(false)
    setPendingName('')
  }, [pendingName, views, params, locale, copy.replaceView])

  const handleLoad = useCallback((view: SavedView) => {
    const base = localePath(locale, '/admin/content')
    const q = view.search ? `&q=${encodeURIComponent(view.search)}` : ''
    router.push(`${base}?tab=content&status=${view.status}&type=${view.type}${q}`)
    setDropdownOpen(false)
  }, [locale, router])

  const handleDelete = useCallback((name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    const newViews = { ...views }
    delete newViews[name]
    setViews(newViews)
    writeViews(locale, newViews)
  }, [views, locale])

  const viewNames = Object.keys(views)

  return (
    <div className="relative flex items-center gap-2">
      {saving ? (
        <>
          <input
            type="text"
            placeholder={copy.viewName}
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            className="h-8 px-2 text-sm border border-border rounded"
            autoFocus
          />
          <button onClick={handleSave} className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90">
            {copy.saveView}
          </button>
          <button onClick={() => setSaving(false)} className="h-8 px-2 text-xs text-muted-foreground">
            ×
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="h-8 px-2.5 text-xs font-medium border border-border rounded hover:bg-muted transition-colors"
        >
          {copy.savedViews}
          {viewNames.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.25 text-xs">
              {viewNames.length}
            </span>
          )}
        </button>
      )}

      {!saving && (
        <>
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Save current filters as a view"
          >
            + {copy.saveView}
          </button>

          {dropdownOpen && viewNames.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-20 w-56 rounded-md border border-border bg-popover shadow-lg">
              <ul className="py-1 text-sm">
                {viewNames.map((name) => {
                  const v = views[name]
                  const isActive = `${v.status}|${v.type}|${v.search ?? ''}` === currentKey
                  return (
                    <li key={name}>
                      <button
                        onClick={() => handleLoad(v)}
                        className={`w-full text-left px-3 py-1.5 hover:bg-muted/50 ${isActive ? 'font-medium bg-muted/30' : ''}`}
                      >
                        {name}
                      </button>
                      <div className="flex justify-between items-center px-3 py-1 text-xs text-muted-foreground">
                        <span>{v.status} / {v.type}</span>
                        <button
                          onClick={() => handleDelete(name)}
                          className="text-destructive hover:underline"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

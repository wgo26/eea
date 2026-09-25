'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDictionary, locales, type Locale } from '@/lib/i18n'

/** The toast host sits outside any localized tree — read the locale from the
 *  URL prefix, mirroring app/[locale]/error.tsx. */
function localeFromLocation(): Locale {
  if (typeof window === 'undefined') return 'en'
  const first = window.location.pathname.split('/')[1]
  return (locales as readonly string[]).includes(first) ? (first as Locale) : 'en'
}

type ToastAction = {
  label: string
  onSelect: () => void
}

type Toast = {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  /** Optional inline action (e.g. Undo) rendered as a button next to dismiss. */
  action?: ToastAction
}

type AddToastOptions = {
  /** Auto-dismiss delay in ms. Defaults to 4000; errors default to 6000. */
  duration?: number
  /** Optional inline action button (e.g. Undo for a reversible change). */
  action?: ToastAction
}

type ToastContextValue = {
  addToast: (message: string, type?: Toast['type'], options?: AddToastOptions) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', options?: AddToastOptions) => {
    const id = Math.random().toString(36).slice(2)
    const duration = options?.duration ?? (type === 'error' ? 6000 : 4000)
    setToasts((prev) => [...prev.slice(-3), { id, message, type, action: options?.action }])
    timers.current.set(id, setTimeout(() => dismissToast(id), duration))
  }, [dismissToast])

  const dismissLabel = getDictionary(localeFromLocation()).common.dismiss

  return (
    <ToastContext.Provider value={{ addToast, dismissToast }}>
      {children}
      {/* Lifted above the bulk-action floating pill (bottom-4, Phase D) so an
          undo toast never lands on top of the selection dock. */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium shadow-lg min-w-64 max-w-sm animate-in slide-in-from-right',
              toast.type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
              toast.type === 'error' && 'bg-red-50 border-red-200 text-red-800',
              toast.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-800',
            )}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onSelect()
                  dismissToast(toast.id)
                }}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold underline underline-offset-2 hover:opacity-80"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label={dismissLabel}
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

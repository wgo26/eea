'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Smartphone, WifiOff } from 'lucide-react'

/**
 * Offline + no-internet fallback notice for the public submit flow (audit:
 * Lost/Found must work on a failed network).
 *
 * Honest behavior — text-field sends are queued by the form outbox
 * (use-submit-queue) and completed on reconnect, but Turnstile + rate limits
 * cannot run offline, so nothing leaves the device until then. What this does:
 * - when offline: a visible banner (draft autosave in the form keeps the
 *   content; the banner says so and tells the user to reconnect + Send);
 * - when `whatsapp` is set (site settings `contact_whatsapp`): a quiet
 *   fallback line — feature-phone / zero-data users can WhatsApp the report
 *   and editors post it for them;
 * - when `sms` is set (site settings `contact_sms`): an sms: deep link for
 *   reporters whose phones have no data at all.
 * Renders nothing when online and no fallback number is configured.
 */
export function SubmitOfflineNotice({
  whatsapp,
  sms,
  title,
  body,
  fallback,
  fallbackSms,
}: {
  whatsapp: string | null
  sms?: string | null
  title: string
  body: string
  fallback: string
  fallbackSms?: string
}) {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const digits = (whatsapp ?? '').replace(/[^\d]/g, '')
  const showFallback = digits.length >= 7
  const smsDigits = (sms ?? '').replace(/[^\d]/g, '')
  const showSms = smsDigits.length >= 7 && !!fallbackSms
  if (online && !showFallback && !showSms) return null

  return (
    <div className="mb-6 space-y-3" role="status">
      {!online ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
            <WifiOff className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-bold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
      ) : null}
      {showFallback ? (
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600/15 text-green-700 dark:text-green-400">
            <MessageCircle className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">
            {fallback.replace('{number}', whatsapp as string)}
          </span>
        </a>
      ) : null}
      {showSms ? (
        <a
          href={`sms:${smsDigits}`}
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">
            {(fallbackSms as string).replace('{number}', sms as string)}
          </span>
        </a>
      ) : null}
    </div>
  )
}

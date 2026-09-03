'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The single exit affordance for focused screens (checklist item 3).
 *
 * Renders a real <a> so the fallback always works without JavaScript. When
 * the referrer is same-origin the click walks back through history (keeping
 * form state and the `next` context intact); otherwise it navigates to the
 * flow's fallback destination. Escape triggers the same behavior — unless
 * the focus is inside a dialog/drawer, which handles Escape itself.
 */
export function BackButton({
  fallback,
  label,
  className,
}: {
  fallback: string
  label: string
  className?: string
}) {
  const router = useRouter()

  const goBack = useCallback(() => {
    try {
      const sameOriginReferrer =
        !!document.referrer &&
        new URL(document.referrer).origin === window.location.origin
      if (sameOriginReferrer && window.history.length > 1) router.back()
      else router.push(fallback)
    } catch {
      router.push(fallback)
    }
  }, [router, fallback])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target?.closest('[role="dialog"], [role="alertdialog"], [data-dismissable-layer]')) {
        return
      }
      goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goBack])

  return (
    <a
      href={fallback}
      onClick={(event) => {
        event.preventDefault()
        goBack()
      }}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </a>
  )
}
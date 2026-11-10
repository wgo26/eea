'use client'

import { useEffect, useState } from 'react'
import { BellPlus, BellRing } from 'lucide-react'
import { subscribeToLocation, unsubscribeFromLocation, getUserLocationSubscriptions } from '@/lib/subscriptions/actions'
import { cn } from '@/lib/utils'
import type { Dictionary } from '@/lib/i18n'

/**
 * Phase 5 — subscribe/unsubscribe toggle for places.
 * Backed by the dedicated `user_location_subscriptions` table (own rows only,
 * RLS `auth.uid() = user_id`). Drives the followed-places digest rail.
 */
export function LocationSubscribeButton({
  locationId,
  locationName,
  copy,
}: {
  locationId: string
  locationName: string
  copy: Dictionary['account']['follows']
}) {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getUserLocationSubscriptions().then((rows) => {
      if (cancelled) return
      setSubscribed(rows.some((r) => r.locationId === locationId))
    })
    return () => {
      cancelled = true
    }
  }, [locationId])

  async function handleClick() {
    if (busy) return
    setBusy(true)
    const result = subscribed
      ? await unsubscribeFromLocation(locationId)
      : await subscribeToLocation(locationId)
    setBusy(false)
    if (!result.ok) return
    setSubscribed(!subscribed)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={subscribed}
      aria-label={
        subscribed
          ? copy.unfollowPlace.replace('{name}', locationName)
          : copy.followPlace.replace('{name}', locationName)
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        subscribed
          ? "border border-primary/30 bg-primary/10 text-primary"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      {subscribed ? (
        <BellRing className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <BellPlus className="h-3.5 w-3.5" aria-hidden />
      )}
      {subscribed ? copy.followingPlace : copy.followPlace}
    </button>
  )
}

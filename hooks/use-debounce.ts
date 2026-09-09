'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Debounces a value by the given delay (default 300ms). Used for
 * search-as-you-type inputs that hit server actions or API routes.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(value), delayMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, delayMs])

  return debounced
}

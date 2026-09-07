import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  // Read the matchMedia store with `useSyncExternalStore` instead of
  // setState-in-effect (react-hooks/set-state-in-effect). The server
  // snapshot stays false, so behavior matches the previous hook: false
  // during SSR/first render, then the real viewport value.
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}

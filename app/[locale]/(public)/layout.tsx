import type { ReactNode } from 'react'
import { PublicShell } from '@/components/shells/public-shell'

/**
 * Public route group — the ONLY place the browsing chrome (header + footer)
 * renders. Shell assignment is a static routing decision, not a runtime
 * header sniff (checklist item 2), so a public page can never leak app
 * chrome and an app page can never leak public chrome.
 */
export default function PublicGroupLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>
}
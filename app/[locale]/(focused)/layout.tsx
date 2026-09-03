import type { ReactNode } from 'react'
import { FocusedShell } from '@/components/shells/focused-shell'

/**
 * Focused route group — login, signup, password reset, submit forms and
 * confirmation screens (checklist items 2 + 3). Minimal chrome with exactly
 * one exit affordance; never indexed.
 */
export const metadata = {
  robots: { index: false, follow: false },
}

export default function FocusedGroupLayout({ children }: { children: ReactNode }) {
  return <FocusedShell>{children}</FocusedShell>
}
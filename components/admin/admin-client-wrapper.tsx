'use client'

import { ToastProvider } from './toast'

export function AdminClientWrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
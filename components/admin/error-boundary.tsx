'use client'

import { Component, type ReactNode } from 'react'

/**
 * Admin error boundary (plan Phase 5.7, spec §59).
 *
 * Class-based (the only way to catch render errors in React): a crashing
 * widget or table degrades to a meaningful, localized error card with
 * retry and back-to-dashboard actions instead of blanking the whole admin
 * shell. Copy travels as props so server pages can pass dictionary strings
 * (client components cannot call the async locale resolver).
 *
 * `dashboardHref` is required and must be locale-prefixed via
 * `localePath(locale, '/admin/dashboard')` — never a hardcoded `/en/...`
 * default (checklist item 1).
 */
export function AdminErrorBoundary({
  children,
  title = 'Something went wrong',
  message = 'This section failed to load. Your work elsewhere is unaffected.',
  retryLabel = 'Try again',
  dashboardLabel = 'Back to dashboard',
  dashboardHref,
}: {
  children: ReactNode
  title?: string
  message?: string
  retryLabel?: string
  dashboardLabel?: string
  /** Locale-prefixed dashboard URL — required so FR admins stay in FR. */
  dashboardHref: string
}) {
  return (
    <ErrorBoundaryInner
      title={title}
      message={message}
      retryLabel={retryLabel}
      dashboardLabel={dashboardLabel}
      dashboardHref={dashboardHref}
    >
      {children}
    </ErrorBoundaryInner>
  )
}

type InnerProps = {
  children: ReactNode
  title: string
  message: string
  retryLabel: string
  dashboardLabel: string
  dashboardHref: string
}

type InnerState = { error: Error | null }

class ErrorBoundaryInner extends Component<InnerProps, InnerState> {
  state: InnerState = { error: null }

  static getDerivedStateFromError(error: Error): InnerState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    // Client-side log only — never ships error internals to analytics.
    console.error('[admin] section error:', error.message)
  }

  private retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="text-sm font-semibold">{this.props.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{this.props.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={this.retry}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            {this.props.retryLabel}
          </button>
          <a
            href={this.props.dashboardHref}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
          >
            {this.props.dashboardLabel}
          </a>
        </div>
      </div>
    )
  }
}

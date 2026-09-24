import Link from 'next/link'
import { cn } from '@/lib/utils'
import { stateToneClasses, type StateTone } from '@/lib/platform/state-presentation'

/**
 * Current system state as a topbar pill (spec §26/§31: "stronger status
 * indicators", "explicit status label"). Presentational and shared by the
 * client topbar and any server surface — the tone→class mapping lives in
 * `lib/platform/state-presentation.ts` so both render identically.
 *
 * The label is always text, never colour alone (spec §33): the dot only
 * reinforces severity for sighted users.
 */
export function SystemStateIndicator({
  label,
  name,
  tone,
  href,
  className,
}: {
  /** Accessible name, e.g. "Platform state". */
  label: string
  /** Localized state name, e.g. "Critical". */
  name: string
  tone: StateTone | string
  /** Where to inspect the state — omitted when the viewer cannot act on it. */
  href?: string
  className?: string
}) {
  const toneClasses = stateToneClasses(tone)
  const classes = cn(
    'inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
    toneClasses.pill,
    className,
  )
  const body = (
    <>
      <span className={cn('h-1.5 w-1.5 rounded-full', toneClasses.dot)} aria-hidden />
      {name}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes} title={label}>
        {body}
      </Link>
    )
  }
  return (
    <span className={classes} title={label}>
      {body}
    </span>
  )
}

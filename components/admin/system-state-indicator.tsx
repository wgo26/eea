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
 *
 * WHY `aria-live` LIVES HERE AND NOT ON THE STATE BANNER. `StateBanner` does
 * carry a live region, but it renders only while the platform is not NORMAL — so
 * the region is MOUNTED AT THE MOMENT the state changes, and a screen reader does
 * not reliably announce content inserted into a live region that did not exist a
 * moment earlier. The transition that matters most (calm → Critical) is exactly
 * the one that can pass unannounced. This pill is persistent: it is in the DOM on
 * every admin screen and only its text changes, which is what an aria-live region
 * has to be to actually interrupt. `polite`, not `assertive` — a state change
 * should be spoken at the next natural pause rather than cut a form label off.
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
  // `inline-flex`, not `contents`: an element with `display: contents` is removed
  // from the box tree, and a live region needs to exist as a box for changes in
  // it to be queued for announcement. The wrapper's own metrics match the pill's.
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

  // The live region is the OUTER, never-changing wrapper. The pill itself swaps
  // between <Link> and <span> depending on whether this viewer may act on the
  // state — and an incident arriving alongside an escalation is exactly when
  // that flips. If `aria-live` sat on the swapping element, React would unmount
  // and remount the region and the change would go unannounced: the very bug
  // this comment is about. `role="status"` + `aria-live` mirrors the convention
  // already used in components/admin/toast.tsx and state-banner.tsx.
  return (
    <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex min-h-[32px] items-center">
      {href ? (
        <Link href={href} className={classes} title={label}>
          {body}
        </Link>
      ) : (
        <span className={classes} title={label}>
          {body}
        </span>
      )}
    </span>
  )
}

/**
 * Audit-trail retention window, in days.
 *
 * `AUDIT_RETENTION_DAYS` is read by THREE surfaces that must agree:
 *
 *   • app/api/cron/db-maintenance/route.ts — which performs the hard delete;
 *   • the audit-log screen's retention line;
 *   • the admin footer, so the window is visible from any screen rather than
 *     only after navigating to the trail it describes (docs/system/audit.md
 *     documents the purge; nothing in the UI stated its size).
 *
 * Those three previously each did their own `Number(process.env.X ?? '365')` or
 * raw string interpolation. The divergence was not cosmetic: the cron clamps to
 * 30–3650 because a typo'd env (`AUDIT_RETENTION_DAYS=1`) would otherwise delete
 * all but a day of forensic history, while a page printing the raw env would have
 * displayed "1" — i.e. the UI would describe a window the purge does not honour,
 * and the whole point of showing it is to be the number an operator can trust.
 * One function, one clamp, and every consumer reads the truth the sweeper uses.
 *
 * Lives here rather than beside its sibling logic in lib/admin/queries/audit.ts
 * because that module is `server-only` and DB-scoped; this is a pure env read
 * with no data access, so a route handler and a footer can both take it without
 * dragging a query layer along.
 */
export const AUDIT_RETENTION_DEFAULT_DAYS = 365
export const AUDIT_RETENTION_MIN_DAYS = 30
export const AUDIT_RETENTION_MAX_DAYS = 3650

export function getAuditRetentionDays(
  raw: string | undefined = process.env.AUDIT_RETENTION_DAYS,
): number {
  // Blank first, and deliberately so: `Number('')` is 0, which the clamp below
  // would turn into the 30-day FLOOR. An unset-but-present `AUDIT_RETENTION_DAYS=`
  // (a real shape in a .env file) would then silently shorten retention by a
  // factor of twelve rather than using the documented default.
  const value = raw?.trim()
  if (!value) return AUDIT_RETENTION_DEFAULT_DAYS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return AUDIT_RETENTION_DEFAULT_DAYS
  return Math.min(Math.max(Math.floor(parsed), AUDIT_RETENTION_MIN_DAYS), AUDIT_RETENTION_MAX_DAYS)
}

import 'server-only'

/**
 * Admin data-access layer — barrel.
 *
 * W17: this file used to be 2,692 lines covering 22 domains. Each domain group
 * now lives in ./queries/<group>.ts (<800 lines each) and is re-exported here,
 * so every existing `@/lib/admin/queries` import site keeps working unchanged.
 * `server-only` stays at this boundary so a client component can never pull the
 * service-role data layer into the browser bundle.
 */
export * from './queries/content-ops'
export * from './queries/dashboard'
export * from './queries/people'
export * from './queries/safety'
export * from './queries/audit'
export * from './queries/states'
export * from './queries/themes'
export * from './queries/credentials'
export * from './queries/approvals'
export * from './queries/catalog'
export * from './queries/programs'
export * from './queries/settings'
export * from './queries/notifications'
export * from './queries/security'
export * from './queries/digest'
export type { AppRole } from './queries/shared'

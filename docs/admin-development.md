# Admin Development Guide

How to add a new admin feature or module without breaking the project's
architecture checklist. Read `docs/implementation-status.md` for where
existing features live.

## 1. New admin page

1. Create `app/[locale]/(app)/admin/<section>/page.tsx` (route group `(app)`
   gives the admin shell; `(focused)` is only for minimal auth/form screens).
2. Guard it: `await requireCapability('<capability>', '/admin/<section>')`
   from `lib/auth/guards.ts`. Never rely on the proxy — it only refreshes
   sessions.
3. Localize metadata: `generateMetadata` from `dict.admin.<section>.title`.
4. Build links with `localePath(locale, '/admin/...')` — never a bare
   `/admin/...` href. Run `node scripts/find-bare-hrefs.mjs`.
5. Add the sidebar entry in `components/admin/nav-items.tsx` with its
   capability, plus `sidebar.<key>` strings in `lib/i18n/en-app.ts` and
   `lib/i18n/fr-app.ts` (fr is typed `Dictionary`: a missing key is a
   compile error).

## 2. New server action

1. Create `lib/admin/actions/<domain>.ts` with `'use server'`.
2. Authorize first: `await assertCapability('<capability>')` (or
   `assertStaff` for staff-wide reads). Throw-based helpers keep the client
   contract catchable.
3. Write through `createAdminClient()` (service-role): new tables are
   SELECT-only under RLS by convention.
4. Audit every mutation: `auditEvent()` for the system trail (`audit_events`)
   with `resourceType`/`resourceId`, plus `audit()` for `moderation_log`
   when the change belongs to the content pipeline. Never log secret values.
5. Revalidate: `revalidateLocalized('/admin/<section>')`, and
   `revalidatePublicContentCache()` when public content changed.
6. Return `{ ok: true }` / `{ ok: false; error }` (or `fail(e)` in catch).

## 3. New table

1. Add a migration `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` with RLS:
   admins/staff read, service-role writes, no public access unless the
   feature demands it.
2. Regenerate types: `node scripts/generate-database-types.mjs`
   (writes `lib/supabase/database.types.ts`).
3. Verify: `node scripts/verify-migrations.mjs`.

## 4. Gated (two-person) operations

For destructive or security-critical actions (spec §44):

1. Add the action key to `TWO_PERSON_ACTIONS` in
   `lib/admin/two-person-control.ts` with its capability.
2. In the action: without an approval id, call `requestTwoPersonApproval`
   and return an `approvalRequired` signal; with one, `checkApproval`
   before the operation and `consumeApproval` after success.
3. Surface pending requests in `app/[locale]/(app)/admin/approvals/page.tsx`
   (capability-gated per action type).

Reference implementations: `lib/admin/actions/credentials.ts`
(`requestCredentialRevocation`), `lib/admin/actions/emergency.ts`
(`publishEmergencyNotice`).

## 5. New contextual state (spec §63–§64)

1. Add `lib/platform/states/<name>.ts` exporting a `SystemStateConfig`
   (id `^[A-Z][A-Z0-9_]{1,39}$`, precedence per the §29 ladder, a known
   `visualProfile` or an inline `visual`).
2. Register it in `lib/platform/states/index.ts` (`PLUGIN_STATES`) — no
   component or engine change needed.
3. Seed `system_states` + `state_schedules` rows if it needs runtime/schedule
   presence; activation writes go through `lib/admin/actions/states.ts`.
4. Examples: `election-period.ts`, `holiday.ts`, `../back-to-school.ts`.

## 6. Strings, errors, performance

- User-visible copy goes in `lib/i18n/en-app.ts` + `lib/i18n/fr-app.ts`
  under `dict.admin.*`; client components receive copy as props.
- Wrap fallible admin sections in `components/admin/error-boundary.tsx`;
  destructive buttons use `components/admin/confirm-dialog.tsx` (with
  `ProductionWarning` for production writes).
- Paginate with `buildPagination` from `lib/admin/performance.ts` and
  debounce search input with `debouncedSearch`; virtualize long tables with
  `components/admin/virtualizer.tsx`.

## 7. Validation

```
npm run typecheck
npm run lint
npm run check
npm run test
```

`npm run check` runs the full verification suite (types, lint, bare-href
audit, client-dictionary check, migration verification). RLS changes also
need `npm run test:rls`; user-facing flows need `npm run test:e2e`.

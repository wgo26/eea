# EEA Admin Dashboard — Implementation Status

Companion to `docs/admin-project-plan.md` (the phased build plan) and
`docs/admin-audit.md` (the spec audit). Each spec section maps to its
implementation; Phase 5.1–5.7 and 6.1 closed the last gaps.

## Phase 1 — Foundation: audit infrastructure & system states

| Spec | Implementation |
|---|---|
| §19 Audit log | `supabase/migrations/20261027000000_admin_audit_infrastructure.sql` (`audit_events`), `lib/admin/queries/audit.ts` (`getAuditEvents`/`getAuditTrail`/`exportAuditTrail`), `app/[locale]/(app)/admin/audit-log/page.tsx`, `auditEvent()` in `lib/admin/actions/_shared.ts` |
| §27/28/29 State engine | `lib/platform/state-engine.ts` (`resolveActiveStates`, `getEffectiveState`, `getStateVisualProfile`, `canActivateState`), `lib/admin/queries/states.ts`, `system_states` + `system_state_events` tables |
| §24–26/39/40 Incidents | `lib/admin/actions/incidents.ts` (single-door `closeIncident`, forward-only lifecycle), `app/[locale]/(app)/admin/incidents/`, `incidents` + `incident_events` tables |
| §45 Environment awareness | `lib/config/env.ts`, `components/admin/env-indicator.tsx` (`EnvIndicator`, `ProductionWarning`) |
| §30/33 State presentation | `components/admin/state-banner.tsx`, `system-state-indicator.tsx`, `state-provider.tsx`, `lib/platform/state-presentation.ts` |

## Phase 2 — Security: secrets & RBAC

| Spec | Implementation |
|---|---|
| §12–16 Secrets | `lib/security/credential-manager.ts` (AES-256-GCM), `lib/admin/queries/credentials.ts`, `lib/admin/actions/credentials.ts` (create/rotate/revoke/disable/enable/test), `app/[locale]/(app)/admin/secrets/`, `api_credentials` + `credential_events` tables |
| §17/18 RBAC | `lib/auth/capabilities.ts`, `lib/auth/admin-roles.ts`, `user_admin_roles` (`20261027000001`), `lib/auth/roles.ts`, `assertAdminRole`/`assertTwoFactor` in `lib/admin/auth.ts` |
| §44 Two-person control | `lib/admin/two-person-control.ts`, `lib/admin/actions/approvals.ts`, `app/[locale]/(app)/admin/approvals/page.tsx`, `two_person_approvals` (`20261027000002`); gated actions: `secret.revoke`, `incident.critical_mode`, `branding.publish`, `emergency.publish`, `data.destructive`, `permissions.escalate`, `auth.configure` |

## Phase 3 — Branding engine

| Spec | Implementation |
|---|---|
| §7/8 Tokens | `lib/branding/tokens.ts` (`BrandTheme`, `DEFAULT_BRAND_THEME`, `composeTheme`), `lib/branding/index.ts` (`loadActiveTheme`, `resolveEffectiveTheme`, `serializeTheme`) |
| §9 Versioning | `lib/admin/actions/themes.ts` (draft → approve → publish → archive → revert), `brand_themes` + `brand_theme_versions` tables, `theme-version-history.tsx` |
| §10/46 Preview | `lib/branding/preview-engine.ts`, `components/admin/theme-preview.tsx`, `theme-publish-panel.tsx`, `components/admin/theme-editor.tsx` |
| §11 Assets | `brand_assets` + `brand_asset_usage` (`20261028000000`), `lib/branding/assets.ts`, `components/admin/asset-library.tsx`, `app/[locale]/(app)/admin/branding/assets/page.tsx` |

## Phase 4 — Contextual states & command center

| Spec | Implementation |
|---|---|
| §20–23 Seasons | `lib/platform/back-to-school.ts`, `BACK_TO_SCHOOL` registered state, `state_schedules` + `20261029000000_contextual_states.sql` |
| §34/35 Dashboard | `lib/admin/queries/dashboard.ts` (`getOperationalAlerts`, `getSystemHealth`, `getPublishingActivity`, `getPrioritizedActions`), `components/admin/widget-system.tsx`, `widget-board.tsx`, `lib/admin/actions/widgets.ts`, `admin_widget_layouts` (`20261030000000`) |
| §36 Search | `adminGlobalSearch` in `lib/admin/actions/content.ts` (content, users, contributors, locations, media, audit events), `components/admin/admin-command-palette.tsx` |
| §37 Command palette | `components/admin/admin-command-palette.tsx` |
| §38 Notifications | `admin_notifications` (`20261031000000`), `lib/admin/queries/notifications.ts`, `lib/admin/actions/notifications.ts`, `app/[locale]/(app)/admin/notifications/page.tsx` |
| §52/53 Observability & security | `lib/observability/metrics.ts`, `app/api/admin/metrics/route.ts`, `lib/admin/queries/security.ts`, `app/[locale]/(app)/admin/security/page.tsx` |

## Phase 5 — Advanced admin features

| Spec | Implementation |
|---|---|
| §41 Emergency publishing | `lib/admin/actions/emergency.ts` (`publishEmergencyNotice`/`createEmergencyPublish`, two-person gate for critical), `app/[locale]/(app)/admin/emergency/`, `emergency_publishing_presets` + `emergency_publish_events` (`20261101000000`) |
| §4 Submission lifecycle | `lib/admin/actions/submission-lifecycle.ts` (`escalateSubmission`, `autoCheckSubmission`, `assignEditor`, `resolveEscalation`), `submission_reviews` + `submission_escalations` (`20261101000001`) |
| §6 Media archive | `lib/admin/actions/media.ts` (`updateMediaMetadata`, `cropMedia`, `resizeMedia`, `archiveMedia`/`restoreMedia`, `searchMedia`), archive/rights columns (`20261101000002`) |
| §55–57 Translations | `lib/admin/actions/translations.ts` (jobs, coverage, DeepL auto-translate, reviewer assignment), `app/[locale]/(app)/admin/translations/`, `translation_jobs` + `translation_memory` (`20261101000003`) |
| §58 Performance | `lib/admin/performance.ts` (`buildPagination`, `totalPages`, `debouncedSearch`), `components/admin/virtualizer.tsx` |
| §59/60 Errors & destructive actions | `components/admin/error-boundary.tsx`, `components/admin/confirm-dialog.tsx` with production warning |

## Phase 6 — Polish & hardening

| Spec | Implementation |
|---|---|
| §63/64 Extensibility | `lib/platform/state-registry.ts` (`defineState`, `ensureStateRegistered`), `lib/platform/states/` manifests, `ELECTION_PERIOD` + `HOLIDAY` example states |
| §68 Acceptance | `npm run check` (typecheck, lint, bare-href audit, dictionary verification, migrations verification), `npm run test`, `npm run test:e2e`, `npm run test:rls` |

## Cross-cutting standards

- Locale-first routing: every admin page under `app/[locale]/(app)/admin/`, links via `localePath`, verified by `scripts/find-bare-hrefs.mjs`.
- Defense in depth: `requireStaff`/`requireCapability` on pages, `assertStaff`/`assertCapability` in actions, SELECT-only RLS with service-role writes.
- i18n: `en-app.ts` source of truth, `fr-app.ts` typed `Dictionary`; admin strings under `dict.admin.*`.
- Audit: every mutation writes `moderation_log` and/or `audit_events`; secrets never enter audit metadata.

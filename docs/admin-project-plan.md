# EEA Admin Dashboard — Phased Implementation Project Plan

Derived from `docs/admin-audit.md` cross-referenced against the existing codebase as of 2026-09-23. Each phase lists:
- **Spec sections** referenced
- **Status** (existing / to-implement)
- **Step-by-step tasks** with file paths
- **Acceptance criteria** from the spec
- **Validation** commands to run at phase completion

---

## Phase 1 — Foundation: Audit Infrastructure & System States

**Spec sections:** 19 (Audit Log), 27 (State Engine), 28 (State Activation), 29 (State Priority), 42 (Branding + State Composition), 45 (Environment Awareness), 52 (Observability), 54 (Data Retention)

**Status:** Partially existing. `moderation_log` table exists but lacks dedicated audit fields. No system state engine. No environment indicator.

### Step 1.1 — Migrate `moderation_log` to full `audit_events` schema

**Spec §19 fields:** `event_id`, `actor_id`, `actor_role`, `action`, `resource_type`, `resource_id`, `timestamp`, `request_id`, `source`, `metadata`

**Tasks:**
1. Create migration `20260924000000_audit_events_schema.sql` adding:
   - `audit_events` table with the spec §19 columns (UUID PK, JSONB `metadata`, `resource_type`/`resource_id` for non-content entities, `request_id` for correlation, `source` for service identification)
   - `system_states` table (spec §27): `id`, `name`, `severity`, `active`, `visual_profile`, `affected_modules`, `behavior_profile` (JSONB), `accessibility_profile`, `activated_at`, `activated_by`, `expires_at`
   - `system_state_events` table (spec §27): log every state activation/deactivation with actor, reason, previous state
   - `incidents` table (spec §39): `id`, `title`, `severity`, `description`, `affected_services` (text[]), `start_time`, `current_status` (enum), `incident_owner`, `internal_notes`, `public_status_message`, `timeline` (JSONB), `resolution_notes`, `resolved_at`, `created_at`, `updated_at`
   - `incident_events` table (spec §39): every status transition on an incident
   - `brand_themes` table (spec §9): `id`, `name`, `version`, `tokens` (JSONB), `status` (draft/review/approved/published/archived), `created_by`, `created_at`, `updated_at`, `approved_by`, `approved_at`, `preview_token`
   - `brand_theme_versions` table (spec §9): immutable snapshots of theme tokens for rollback
   - `api_credentials` table (spec §12): `id`, `name`, `provider`, `status` (active/disabled/expired/revoked), `created_by`, `created_at`, `last_used_at`, `expires_at`, `rotation_policy` (JSONB), `metadata` (non-secret: last 4 chars, scopes)
   - `credential_events` table (spec §555): `id`, `credential_id`, `action` (create/rotate/revoke/disable/enable), `actor_id`, `timestamp`, `request_id`, `source` — never stores the secret value
   - RLS policies: admins can read/list audit_events; system services write; no public access
2. Update `lib/supabase/database.types.ts` via `generate-database-types.mjs`
3. Create `lib/admin/queries/audit.ts`:
   - `getAuditEvents(options)` — paginated, filterable by action/resource_type/actor/date range/search
   - `getAuditFilterOptions()` — distinct actions, resource types
   - `exportAuditEvents(options)` — CSV export (spec §19: "Log: Login, Logout, Permission changes, Content changes, …")
4. Update `lib/admin/actions/_shared.ts`:
   - Extend `AuditEntry` type to include `resource_type`, `resource_id`, `request_id`, `source`
   - Add `auditEvent()` helper that writes to `audit_events` (separate from moderation_log for non-moderation actions)
   - Keep `moderation_log` for the moderation/submission pipeline; `audit_events` for system-level events (secrets, branding, incidents, config)
5. Update `app/[locale]/(app)/admin/audit-log/page.tsx` to use `audit_events` as the primary source, with `moderation_log` rows joined for content context

### Step 1.2 — System State Engine

**Spec §20-33:** Semantic UI States, State Engine Architecture, State Activation, State Priority, Design System Integration, Component State Support, Motion System, Accessibility Requirements

**Tasks:**
1. Create `lib/platform/state-engine.ts`:
   - `SystemState` interface (spec §27)
   - `resolveActiveStates()` — returns all active states, sorted by precedence (spec §29)
   - `getEffectiveState()` — top-precedence active state, or `NORMAL`
   - `getStateVisualProfile(stateId)` — maps state → semantic token overrides
   - `canActivateState(stateId, actorId)` — permission check via `assertCapability('system.configure')`
2. Create `lib/admin/queries/states.ts`:
   - `getActiveStates()` — reads `system_states` where `active = true`
   - `getStateById(id)` — single state lookup
   - `getStateHistory(stateId)` — `system_state_events` for one state
   - `getIncidents()` — active + recent incidents (spec §39)
   - `getIncidentById(id)` — full incident detail with timeline
3. Add to `lib/auth/capabilities.ts`:
   - `system.configure` capability
   - `incidents.manage` capability
   - `branding.publish` capability
4. Update `app/[locale]/(app)/admin/layout.tsx` or create a new `app/[locale]/(app)/admin/layout.tsx` context provider that reads the active system state and injects CSS custom properties / semantic token overrides (spec §30: State → Semantic Tokens → Design System → Components)
5. Create `components/admin/state-banner.tsx`:
   - Renders the spec §26 critical-mode banner: incident ID, description, owner, start/update times, action buttons
   - Uses `aria-live` for accessibility (spec §33: "Every semantic state must have explicit accessible information")
   - Shows for any non-NORMAL state, not just critical
6. Create `components/admin/system-state-indicator.tsx`:
   - Small status pill showing current system state in admin topbar
   - Links to incident detail if active

### Step 1.3 — Environment Awareness

**Spec §45:** Dashboard must show `PRODUCTION` / `STAGING` / `DEVELOPMENT` with distinct visual treatment. Dangerous operations say "You are modifying PRODUCTION."

**Tasks:**
1. Create `lib/config/env.ts`:
   - `getEnvironment()` — read `NEXT_PUBLIC_APP_ENV` → `production` | `staging` | `development`
   - `isProduction()` helper
   - `ENVIRONMENT_LABELS` record with spec §45 styling metadata
2. Create `components/admin/env-indicator.tsx`:
   - Badge in admin topbar with environment name + distinct color (spec §45: "Production should have a visually distinct but professional indicator")
   - For non-production, no special styling; for production, amber/red tint
3. Wrap destructive action buttons with a production-confirmation step that shows spec §45 text: "You are modifying PRODUCTION."

### Step 1.4 — Incident Management

**Spec §24-26, 39-40:** Disaster/Critical Mode, Incident Management, Public vs Internal Incident Information

**Tasks:**
1. Create `lib/admin/actions/incidents.ts`:
   - `createIncident(input)` — assert `system.configure`, insert into `incidents`, log to `system_state_events`, activate `CRITICAL` state automatically, revalidate
   - `updateIncident(id, updates)` — field updates + timeline append
   - `closeIncident(id, resolution)` — set `current_status = resolved`, deactivate `CRITICAL` state, restore previous state
   - `resolveIncident(id)` / `investigateIncident(id)` — status transitions (spec §39: investigating → identified → mitigating → monitoring → resolved)
   - Each action writes to `audit_events` (spec §55: "Incident states: investigating, identified, mitigating, monitoring, resolved")
2. Create `app/[locale]/(app)/admin/incidents/page.tsx`:
   - List view: active incidents (table), recent incidents (table)
   - `requireCapability('system.configure')` guard
3. Create `app/[locale]/(app)/admin/incidents/[id]/page.tsx`:
   - Incident detail: full timeline, internal notes (admin-only), public status message editor, "Activate Critical Mode" / "Resolve" buttons
   - Spec §40 boundary: clearly separated internal record vs public message
4. Add incident route to `components/admin/nav-items.tsx` under `system.configure` capability

### Step 1.5 — Acceptance Criteria Checkpoints

```
npm run typecheck
npm run lint
npm run check
node scripts/verify-migrations.mjs
```

**Verify:**
- [ ] `audit_events` table created with spec §19 fields
- [ ] `system_states` table created with spec §27 interface fields
- [ ] `incidents` / `incident_events` tables created
- [ ] `brand_themes` / `brand_theme_versions` tables created
- [ ] `api_credentials` / `credential_events` tables created
- [ ] State engine resolves precedence correctly (unit test)
- [ ] Environment indicator renders in admin topbar
- [ ] State banner renders for critical incidents
- [ ] Incident detail page loads and shows timeline
- [ ] `npm run check` passes

---

## Phase 2 — Security: Secret Management & RBAC Enhancement

**Spec sections:** 12 (API & Secret Management), 13 (Secret Management UX), 14 (Secret Operations), 15 (Rotation Workflow), 16 (Secret Security Requirements), 17 (RBAC / Admin Roles), 18 (Permission Model), 44 (Two-Person Control), 51 (API Design)

**Status:** Existing roles: `admin`, `editor`, `contributor`, `advertiser`. Capabilities system exists. No credential management UI. No rotation workflow. No two-person control.

### Step 2.1 — Expand Role Model & Permission Model

**Spec §17:** Super Administrator, Platform Administrator, Editorial Administrator, Senior Editor, Moderator, Marketplace Administrator, Media Administrator, Analyst, Support/Operator

**Tasks:**
1. Add new capabilities to `lib/auth/capabilities.ts`:
   - `secrets.read_metadata`, `secrets.create`, `secrets.rotate`, `secrets.revoke`, `secrets.manage`
   - `incidents.manage`
   - `branding.publish`
   - `system.configure`
   - `analytics.read`
   - `listings.manage`
   - `media.manage`
2. Add new role mappings (spec §17):
   - Create `lib/auth/admin-roles.ts` with the full role model
   - `super_admin` (alias of `admin` in capability terms)
   - `platform_admin` → everything except branding publish
   - `editorial_admin` → content + submissions + moderation
   - `senior_editor` → content + moderation review
   - `moderator` → moderation + reports
   - `marketplace_admin` → listings + Buy & Sell
   - `media_admin` → media uploads + rights
   - `analyst` → `analytics.read` only
   - `support_operator` → limited user view + ticket
   - `member` = authenticated with no roles (documented)
3. Add `user_admin_roles` table (migration `20260924000001_admin_roles.sql`):
   - `user_id`, `role` (text), `assigned_by`, `assigned_at`, `expires_at`
   - Keep `app_role` enum for legacy `admin`/`editor`
   - New roles stored as text to allow future expansion without enum migration
4. Update `lib/auth/roles.ts`:
   - `getAdminRoles(supabase, userId)` — returns full admin roles array
   - `hasAdminRole(roles, role)` — check helper
5. Update `lib/admin/auth.ts`:
   - `assertAdminRole(role)` — check for a specific admin role (e.g. `platform_admin`)
   - `assertTwoFactor()` — step-up for destructive operations (spec §44)

### Step 2.2 — Secret Management Infrastructure

**Spec §12-16:** Credential categories, secret management UX, secret operations, rotation workflow, secret security requirements

**Tasks:**
1. Create `lib/security/credential-manager.ts`:
   - `createCredential(name, provider, secretValue)` — encrypts at rest using a server-side key (spec §16: "Be encrypted at rest")
   - `getCredentialMetadata(id)` — returns masked secret + metadata only (spec §13: "The dashboard should show metadata, not plaintext secrets")
   - `rotateCredential(id, newSecret)` — creates new credential version, starts transition (spec §15 workflow)
   - `revokeCredential(id)` — immediately invalidates (spec §14: "Revoke: Immediately invalidate credentials")
   - `disableCredential(id)` / `enableCredential(id)` — toggle status
   - `getCredentialUsage(id)` — last used, usage volume, associated service (spec §14: "View usage")
   - Secret values encrypted with AES-256-GCM via `crypto` module; encryption key from `CREDENTIAL_ENCRYPTION_KEY` env
2. Create `lib/admin/queries/credentials.ts`:
   - `getCredentialsAdmin()` — list all credentials with metadata (masked)
   - `getCredentialById(id)` — single credential detail + usage events
   - `getCredentialEvents(credentialId)` — rotation/revoke history from `credential_events`
3. Create `lib/admin/actions/credentials.ts`:
   - `createCredential(input)` — assert `secrets.create`, encrypt, store mask, log to `credential_events` + `audit_events`
   - `rotateCredential(id)` — assert `secrets.rotate`, generate new version, start transition window (spec §15: "Generate replacement credentials while maintaining controlled transition")
   - `revokeCredential(id)` — assert `secrets.revoke`, immediately invalidate, log
   - `disableCredential(id)` / `enableCredential(id)` — toggle status
   - `testCredential(credentialId)` — verify the credential works against its provider (spec §15: "Validate" step)
   - All operations write to `audit_events` with `resource_type = 'api_credential'`
4. Create `app/[locale]/(app)/admin/secrets/page.tsx`:
   - List view: credential name, provider, status, created, last used, actions
   - Spec §13: show `••••••••••••••••` for secret value, never plaintext after creation
   - Filter by status (active/disabled/expired/revoked) and provider
5. Create `app/[locale]/(app)/admin/secrets/[id]/page.tsx`:
   - Detail view: full metadata, secret masked (show only at creation time)
   - Rotation workflow UI: spec §15 — show current → generate new → validate → deploy → verify → revoke old as a stepper
   - Two-person approval gate for revoke (spec §44): require secondary confirmation
6. Create `app/[locale]/(app)/admin/secrets/new/page.tsx`:
   - Form: name, provider, secret value input
   - Shows full secret **only once** at creation (spec §13: "The full secret should only be displayed at creation time")
   - Copy-to-clipboard + download options
7. Add "Secrets" nav item to `components/admin/nav-items.tsx` with `secrets.create` capability

### Step 2.3 — Two-Person Control

**Spec §44:** Require secondary approval for: production secret revocation, global branding changes, critical-mode activation, destructive data operations, permission escalation, authentication configuration changes.

**Tasks:**
1. Create `lib/admin/two-person-control.ts`:
   - `requestTwoPersonApproval(action, actorId, resourceId, reason)` — creates a pending approval record in `two_person_approvals` table
   - `checkApproval(approvalId, approverId)` — verifies the approver is a different admin with the capability
   - `isApprovalRequired(action)` — spec §44 list
2. Create migration `20260924000002_two_person_control.sql`:
   - `two_person_approvals` table: `id`, `action`, `actor_id`, `resource_type`, `resource_id`, `reason`, `approver_id` (nullable), `status` (pending/approved/rejected/expired), `created_at`, `expires_at`, `responded_at`
   - RLS: only the two involved admins can see a given approval row
3. Update credential revoke and incident activation actions to require two-person approval
4. Create `app/[locale]/(app)/admin/approvals/page.tsx`:
   - List of pending approval requests requiring the current user's signature
   - `requireCapability('system.configure')` or `secrets.revoke` depending on action type

### Step 2.4 — Acceptance Criteria Checkpoints

```
npm run typecheck
npm run lint
npm run check
```

**Verify:**
- [ ] 9 new admin capabilities added and mapped to roles
- [ ] `user_admin_roles` table created
- [ ] `api_credentials` / `credential_events` tables created with masked secrets
- [ ] `two_person_approvals` table created with RLS
- [ ] Secret management pages load (create/list/detail/rotate)
- [ ] Two-person approval flow gates secret revocation
- [ ] `npm run check` passes (server actions are async, no bare hrefs)

---

## Phase 3 — Branding Engine & Design System Tokens

**Spec sections:** 7 (Branding Engine), 8 (Design Token Architecture), 9 (Theme Versioning), 10 (Brand Preview Mode), 11 (Asset Management), 42 (Branding + State Composition), 46 (Safe Preview), 13.1 (Secret Management UX — brand assets are not secrets)

**Status:** Existing `site_settings` table stores simple key-value config (site name, logo URL, social links). No token-based theming, no theme versioning, no preview mode, no asset library.

### Step 3.1 — Design Token Infrastructure

**Spec §7-8:** Token-based styling, semantic tokens, shared between public + admin

**Tasks:**
1. Create `lib/branding/tokens.ts`:
   - `ColorTokens`, `TypographyTokens`, `SpacingTokens`, `RadiusTokens`, `ShadowTokens`, `MotionTokens`, `ImageryTokens`, `ComponentTokens` interfaces (spec §8 example)
   - `BrandTheme` interface (spec §8 example)
   - `DEFAULT_BRAND_THEME` — baseline Eagle Eye Africa tokens matching the existing CSS design
   - `getStateTokenOverrides(stateId)` — maps system state → semantic token deviations (spec §30)
   - `getAccessibilityTokenOverrides(mode)` — high contrast, reduced motion, etc.
   - `composeTheme(base, state, accessibility)` → spec §42 formula
2. Create `lib/branding/index.ts`:
   - `loadActiveTheme()` — reads published theme from `brand_themes` table
   - `resolveEffectiveTheme()` — composes base + active state + accessibility (spec §42)
   - `serializeTheme(theme)` → CSS custom properties string for `<style>` injection
3. Create `lib/branding/validation.ts`:
   - `validateTheme(theme)` — spec §68: "Invalid contrast combinations are detected"
   - `validateColorPairing(foreground, background)` — WCAG 2.1 AA minimum (4.5:1)
   - `validateFontLoading(theme)` — check font URLs are reachable
   - `checkMissingAssets(theme)` — spec §10: "Missing asset warnings"
4. Create `supabase/migrations/20260925000000_branding_tokens.sql`:
   - `brand_themes` table (already planned in Phase 1.1)
   - `brand_theme_versions` table
   - `brand_assets` table: `id`, `name`, `type` (logo/wordmark/icon/illustration/etc.), `file_url`, `dimensions`, `format`, `version`, `owner_id`, `usage_restrictions`, `created_at`, `updated_at`, `is_active`
   - `brand_asset_usage` junction: tracks where each asset is referenced (spec §11: "Usage restrictions")
   - `system_state_themes` junction: which themes are affected by which states (spec §42)

### Step 3.2 — Brand Editor Pages

**Spec §7.1, §10, §46:** Admin can configure identity, typography, color system. Preview before publish. Safe preview workflow.

**Tasks:**
1. Add `branding.publish` capability to `lib/auth/capabilities.ts`
2. Create `components/admin/theme-editor.tsx`:
   - Tabbed interface: Identity, Typography, Colors, Assets
   - Identity: platform name, tagline, logo upload, favicon, app icon, social preview image (spec §7.1)
   - Typography: font selectors with font weights/scale/leading/spacing controls (spec §7.1)
   - Colors: semantic token editor with live contrast validation (spec §7.1: "brand.primary", "surface.background", "text.primary", etc.)
   - Spec §10: live preview showing how theme affects real components (homepage, news, photo story, notice, buy & sell)
   - Spec §10: desktop/tablet/mobile previews, light/dark variants, contrast warnings
3. Create `app/[locale]/(app)/admin/branding/page.tsx`:
   - List published theme versions + current active theme
   - "Create new theme" button → opens editor in draft mode
   - `requireCapability('branding.publish')` guard
4. Create `app/[locale]/(app)/admin/branding/[id]/page.tsx`:
   - Theme detail: view tokens, history, approval status
   - Spec §9: version history with author/timestamp/changes
   - "Make current" button (publishes)
   - Preview mode: spec §10 — renders the theme against real component templates
   - Spec §46 workflow: Edit → Preview → Validate → Approve → Publish
5. Create `components/admin/asset-library.tsx`:
   - Grid of brand assets (logos, wordmarks, icons, illustrations)
   - Spec §11: each asset shows ID, name, type, dimensions, format, version, owner, usage restrictions
   - Upload + replace + archive actions
6. Create `app/[locale]/(app)/admin/branding/assets/page.tsx`:
   - Full asset library with filtering by type
   - `requireCapability('branding.publish')` guard
7. Add "Branding" nav item to `components/admin/nav-items.tsx`

### Step 3.3 — Theme Versioning & Safe Preview

**Spec §9, §46:** Every published brand config has a version. Preview before publishing.

**Tasks:**
1. Create `lib/admin/actions/themes.ts`:
   - `createThemeDraft(input)` — assert `branding.publish`, insert draft theme, log to `audit_events`
   - `publishTheme(themeId)` — move from draft → approved → published, deactivate previous version, log
   - `previewTheme(themeId)` — validate + return composed theme for preview renderer
   - `archiveTheme(themeId)` — spec §9: "Archived" status
   - `revertToThemeVersion(themeId)` — restore a previous version
2. Create `lib/branding/preview-engine.ts`:
   - `renderThemePreview(theme, componentName)` — renders a representative sample of the component with the given theme
   - Used by spec §10 preview mode
3. Update `lib/admin/actions/_shared.ts` `revalidateLocalized` calls to also invalidate brand assets cache (new `CACHE_TAGS.brand` tag)

### Step 3.4 — Acceptance Criteria Checkpoints

```
npm run typecheck
npm run lint
npm run check
```

**Verify:**
- [ ] `BrandTheme` interface matches spec §8
- [ ] Token composition follows spec §42 formula
- [ ] Theme editor validates contrast (WCAG AA)
- [ ] Theme versioning with author/timestamp/changes
- [ ] Preview mode shows real components
- [ ] Asset library has upload/replace/archive
- [ ] `npm run check` passes

---

## Phase 4 — Contextual States & Command Center

**Spec sections:** 20 (Atmospheric/Contextual UI), 22 (Back to School Mode), 23 (Back to School Operational Behavior), 24-33 (Disaster/Critical Mode through Accessibility), 34 (Admin Dashboard Home), 35 (Dashboard Widget System), 36 (Search), 37 (Global Command Palette), 38 (Notification Centre), 53 (Security Monitoring), 52 (Observability)

**Status:** Basic dashboard exists with some stats. Command palette exists. No contextual states. No widget system. No notification center. No security monitoring. No observability dashboard.

### Step 4.1 — Contextual State Engine

**Spec §20-33:** Semantic UI States, state priority, motion system, accessibility

**Tasks:**
1. Complete `lib/platform/state-engine.ts` (started in Phase 1.2):
   - Register built-in states: `NORMAL`, `SEASONAL`, `HIGH_ACTIVITY`, `INCIDENT`, `CRITICAL`, `MAINTENANCE`, `DEGRADED`, `RECOVERY` (spec §20)
   - `registerSystemState(config)` — spec §64 plugin-style registry
   - `getStateBehavior(stateId)` — returns navigation/notification/content priority/motion overrides
   - `activateState(stateId, actorId, reason)` — system action, writes to `system_state_events`
   - `deactivateState(stateId, actorId)` — deactivates, restores previous
2. Create migration `20260925000001_contextual_states.sql`:
   - Seed `system_states` table with the 8 built-in states from spec §20
   - `state_activations` table: track which states are currently active with precedence ordering
   - `system_state_events` (already in Phase 1.1): log every activation/deactivation
3. Create `lib/observability/metrics.ts`:
   - `getSystemMetrics()` — API health, DB health, storage health, queue health, error rate (spec §52)
   - `getSystemStatus()` — returns `healthy` | `degraded` | `unavailable` | `unknown` (spec §52)
   - Used by dashboard health widget + automatic state activation
4. Create `app/api/admin/metrics/route.ts`:
   - Internal API endpoint (protected, spec §51: authenticated + authorized + rate-limited)
   - Returns aggregated metrics for the observability dashboard
   - Used by the metrics worker that auto-activates `DEGRADED`/`CRITICAL` states

### Step 4.2 — Back to School Mode

**Spec §22-23:** Seasonal/contextual operational theme, content prioritization, dashboard widgets

**Tasks:**
1. Create `lib/platform/back-to-school.ts`:
   - `BackToSchoolConfig` — date range, content priorities, widget overrides
   - `isActiveBackToSchool()` — date-based activation
   - `getBackToSchoolContentPriorities()` — spec §23: Education, Schools, Scholarships, Transport, Community notices, School-related marketplace listings
2. Register `back_to_school` as a seasonal state via `registerSystemState` (spec §64)
3. Create activation rules: scheduled 01 Sept → 30 Sept (spec §28)
4. Apply to dashboard: spec §23 widgets — Education stories, School notices, Community alerts, Upcoming dates, Education submissions

### Step 4.3 — Critical Mode UI

**Spec §24-26:** Disaster/Critical mode visual language, UI, critical mode overrides cosmetic states

**Tasks:**
1. Complete `components/admin/state-banner.tsx` (started in Phase 1.2):
   - Spec §26: renders the boxed banner with incident info, owner, timestamps, action buttons
   - Spec §21: "A critical state must never be communicated only through color/lighting/animation" — always has explicit text
   - Spec §25: higher contrast, reduced decorative elements, stronger status indicators
2. Create `components/admin/state-provider.tsx`:
   - React context provider that reads active system states server-side and injects CSS custom properties
   - Spec §30: State → Semantic Tokens → Design System → Components
   - Respects `prefers-reduced-motion` (spec §32)
3. Update `components/admin/sidebar.tsx` and `components/admin/topbar.tsx`:
   - Apply state-based color overrides via CSS custom properties
   - Show state indicator in topbar

### Step 4.4 — Enhanced Dashboard

**Spec §34-35:** Dashboard answers 5 questions, widget system, prioritized actions

**Tasks:**
1. Create `lib/admin/queries/dashboard.ts` (extend existing):
   - `getOperationalAlerts()` — spec §34: "What requires attention" — pending items older than 48h, failing jobs, active incidents
   - `getSystemHealth()` — spec §52 metrics
   - `getPublishingActivity()` — recent publishing by type
   - `getPrioritizedActions()` — spec §34: "What should I do next?" based on role + state
2. Create `components/admin/widget-system.tsx`:
   - Spec §35: modular widget architecture
   - Widget registry: Pending Submissions, Editorial Queue, Moderation Queue, Active Notices, Marketplace Activity, Photo Archive, Platform Health, Active Incident, Recent Activity, Publishing Calendar
   - `addWidget()`, `removeWidget()`, `reorderWidgets()` — persisted per-role layout
   - `saveWidgetLayout(role, layout)` — store in `admin_widget_layouts` table
3. Create `lib/admin/actions/widgets.ts`:
   - `saveDashboardLayout(userId, layout)` — persist widget config
   - `resetDashboardLayout(userId)` — restore defaults for role
4. Update `app/[locale]/(app)/admin/dashboard/page.tsx`:
   - Integrate widget system
   - Add operational alerts section (spec §34.1)
   - Add system health widget (spec §34.3)
   - Add prioritized actions list (spec §34.5)

### Step 4.5 — Notification Centre

**Spec §38:** Categorized notifications (Informational, Action Required, Warning, Critical)

**Tasks:**
1. Create migration `20260925000002_notification_centre.sql`:
   - `admin_notifications` table: `id`, `user_id`, `category` (info/action_required/warning/critical), `title`, `body`, `link_path`, `is_read`, `created_at`, `expires_at`
   - `admin_notification_sources` table: track which system produced each notification (for debugging)
2. Create `lib/admin/queries/notifications.ts`:
   - `getAdminNotifications(userId, options)` — paginated, filterable by category/read
   - `getUnreadNotificationCounts(userId)` — per-category counts
   - `markAllNotificationsRead(userId)` 
3. Create `lib/admin/actions/notifications.ts`:
   - `createAdminNotification(input)` — system action
   - `dismissNotification(id)` / `markNotificationRead(id)`
   - `sendNotificationToRole(role, notification)` — broadcast to all admins with a role
4. Create `app/[locale]/(app)/admin/notifications/page.tsx`:
   - Tabbed interface by category (spec §38)
   - Mark all read, bulk dismiss
   - `requireCapability('viewDashboard')` guard
5. Add "Notifications" nav item with badge count

### Step 4.6 — Security Monitoring Dashboard

**Spec §53:** Surface repeated failed logins, suspicious session activity, permission escalation, credential rotation/revocation, unusual API activity, bulk deletion, large publishing operations

**Tasks:**
1. Create `lib/admin/queries/security.ts`:
   - `getSecurityEvents(options)` — query `audit_events` for security-sensitive actions
   - `getFailedLoginAttempts(options)` — repeated failed logins with rate detection
   - `getSuspiciousActivity(options)` — anomalous patterns (bulk operations, privilege escalation)
   - `getCredentialChanges(options)` — rotation/revocation events
2. Create `app/[locale]/(app)/admin/security/page.tsx`:
   - Security events timeline
   - Failed login heat map
   - `requireCapability('viewAuditLog')` guard
3. Add "Security" nav item under `viewAuditLog` capability

### Step 4.7 — Acceptance Criteria Checkpoints

```
npm run typecheck
npm run lint
npm run check
npm run test
```

**Verify:**
- [ ] `registerSystemState` works with plugin-style config
- [ ] State precedence: CRITICAL overrides seasonal (unit test)
- [ ] State banner renders with explicit text (not just color)
- [ ] Back to School state activates on schedule
- [ ] Widget system persists per-role layout
- [ ] Notification centre has 4 categories with counts
- [ ] Security monitoring surfaces failed logins + bulk ops
- [ ] `prefers-reduced-motion` respected
- [ ] `npm run check` passes

---

## Phase 5 — Advanced Admin Features

**Spec sections:** 4 (Community Submissions), 5 (Moderation & Community Safety), 6 (Media & Photo Archive), 36 (Admin Search), 41 (Emergency Publishing), 47-51 (Technical/Frontend/Backend Architecture, API Design, Observability), 55 (Language Management), 56 (Admin Localization), 57 (Admin Localization), 58 (Performance), 59 (Error Handling), 60 (Destructive Actions), 62 (Design Language)

**Status:** Submission workflow exists (basic approve/reject/request clarification). Moderation queue exists. Media archive exists (basic). Admin search via command palette only. No emergency publishing. No proper API design docs. No language management. No performance optimizations beyond basic pagination.

### Step 5.1 — Emergency Publishing

**Spec §41:** Rapid publish for emergency notices, public safety notices, service disruptions, community alerts, important corrections

**Tasks:**
1. Create migration `20260926000000_emergency_publishing.sql`:
   - `emergency_publishing_presets` table: `id`, `name`, `content_type`, `template` (JSONB content), `requires_two_person` (boolean), `created_by`, `created_at`
   - `emergency_publish_events` table: log every emergency publish action
2. Create `lib/admin/actions/emergency.ts`:
   - `createEmergencyPublish(input)` — assert `manageContent` + `system.configure` for critical states
   - `publishEmergencyNotice(input)` — creates content item + publishes immediately, bypasses normal review queue
   - Log to `audit_events` with `resource_type = 'emergency_publish'`
   - Spec §41: "Emergency publishing should still retain author, timestamp, authorization, audit record"
3. Create `app/[locale]/(app)/admin/emergency/page.tsx`:
   - Emergency publishing panel with quick templates
   - Spec §24: "Major public-safety notice" / "Critical moderation incident" triggers
   - Two-person approval gate (spec §44)
4. Add "Emergency" nav item (conditionally visible when `system.configure` capability + active/incident state)

### Step 5.2 — Submission Lifecycle Enhancement

**Spec §4:** Submission states: RECEIVED → AUTOMATED CHECKS → EDITORIAL REVIEW → (REQUEST CHANGES | REJECT | ESCALATE | APPROVE) → SCHEDULE → PUBLISH

**Tasks:**
1. Create migration `20260926000001_submission_lifecycle.sql`:
   - `submission_reviews` table: `id`, `submission_id`, `reviewer_id`, `status_from`, `status_to`, `notes`, `review_type` (automated/editorial), `created_at`
   - `submission_escalations` table: `id`, `submission_id`, `reason`, `escalated_by`, `assigned_to`, `created_at`, `resolved_at`
2. Create `lib/admin/actions/submission-lifecycle.ts`:
   - `escalateSubmission(id, reason)` — spec §4: move to editorial review with escalation flag
   - `autoCheckSubmission(id)` — automated checks (duplicate detection, content safety scan)
   - `assignEditor(submissionId, editorId)` — route to specific editor
3. Update submission detail page to show the full lifecycle timeline
4. Add "Automated checks" step with trust/safety flagging (spec §5: "Suspicious submissions")

### Step 5.3 — Media Archive Enhancement

**Spec §6-7.1:** Media manager with upload, replace, crop, resize, reorder, metadata, rights metadata

**Tasks:**
1. Create `lib/admin/actions/media.ts`:
   - `updateMediaMetadata(id, input)` — caption, credit, location, date, rights info
   - `cropMedia(id, input)` — crop coordinates
   - `resizeMedia(id, input)` — resize to standard dimensions
   - `archiveMedia(id)` — mark archived, don't delete
   - `searchMedia(query)` — full-text search across metadata
2. Extend `lib/admin/queries/safety.ts` `getMediaAssets`:
   - Add crop/resize status fields
   - Add rights metadata (creator, copyright holder, license, usage permission, consent status)
3. Update media display in existing upload/media-picker components
4. Add crop/resize tools to media library

### Step 5.4 — Admin Global Search

**Spec §36:** Search across content, users, contributors, locations, media, notices, listings, reports, audit events

**Tasks:**
1. Extend `lib/admin/actions/content.ts` `adminGlobalSearch`:
   - Add user/contributor search (already partially implemented)
   - Add location search
   - Add media search with metadata
   - Add audit event search (spec §36: "audit events")
   - All results respect permissions (spec §36: "Results must respect permissions")
2. Update `components/admin/admin-command-palette.tsx`:
   - Show search results grouped by entity type
   - Highlight matching terms
   - Quick jump to filtered admin pages

### Step 5.5 — Language Management

**Spec §55-57:** Content language as first-class CMS concern, translation status tracking, separate UI translation system

**Tasks:**
1. Create migration `20260926000002_translation_management.sql`:
   - `translation_jobs` table: `id`, `content_item_id`, `target_locale`, `source_locale`, `status` (pending/in_progress/completed/failed), `translator_id`, `reviewer_id`, `created_at`, `completed_at`
   - `translation_memory` table: `id`, `source_text_hash`, `source_locale`, `target_locale`, `source_text`, `target_text`, `created_at` — for TM suggestions
2. Create `lib/admin/actions/translations.ts`:
   - `createTranslationJob(contentItemId, targetLocale)` — spec §55
   - `autoTranslateJob(jobId)` — uses DeepL (existing integration in `lib/translate/deepl.ts`)
   - `completeTranslationJob(jobId, translatedText)` — marks complete, updates `content_translations`
   - `assignReviewer(jobId, reviewerId)` — spec §55: "reviewer"
3. Create `app/[locale]/(app)/admin/translations/page.tsx`:
   - List of translation jobs with status filter
   - Coverage report: which content items have translations in which locales (spec §55: "translation status")
   - Bulk-create jobs for untranslated content
4. Update content edit drawer to show per-locale translation status (spec §55: "canonical content, translation, translation status, translator, reviewer, published translation")

### Step 5.6 — Two-Person Control for Emergency & Branding

**Spec §44:** Critical-mode activation, global branding changes, destructive data operations, authentication configuration changes

**Tasks:**
1. Extend `lib/admin/two-person-control.ts`:
   - `requestApprovalFor(action, resourceId, reason)` — generic approval requester
   - `checkAndRequireApproval(action)` — checks if action needs 2FA
2. Update emergency publishing and theme publishing to require two-person approval for critical states

### Step 5.7 — Performance & Error Handling

**Spec §58-60:** Pagination, server-side filtering, debounced search, virtualized tables, error handling, destructive action protection

**Tasks:**
1. Create `lib/admin/performance.ts`:
   - `getPaginatedContent(options)` — spec §58 optimized pagination
   - `searchContentDebounced(query, delay)` — debounced search wrapper
2. Extend `components/admin/virtualizer.tsx` usage in content tables
3. Create `components/admin/error-boundary.tsx`:
   - Spec §59: meaningful error states with retry/view-draft actions
4. Update all destructive action buttons with spec §60 confirmation:
   - "Type DELETE to confirm" for especially dangerous actions
   - `components/admin/confirm-dialog.tsx` already exists — wire to destructive actions

### Step 5.8 — Acceptance Criteria Checkpoints

```
npm run typecheck
npm run lint
npm run check
npm run test
npm run test:e2e
```

**Verify:**
- [ ] Emergency publish flow retains author/timestamp/audit (spec §41)
- [ ] Submission lifecycle has 6 states with transition logging
- [ ] Media archive supports crop/resize/metadata
- [ ] Global search covers all spec §36 entities with permission filtering
- [ ] Translation jobs track translator/reviewer (spec §55)
- [ ] Two-person approval gates critical operations
- [ ] Destructive actions require "Type DELETE to confirm"
- [ ] `npm run check` passes

---

## Phase 6 — Polish & Production Hardening

**Spec sections:** 1 (Purpose), 2 (Product Objectives), 61 (Design Language), 62 (Core Design Principle), 63-64 (Extensibility), 65 (Admin Experience Principle), 66 (Non-Goals), 67 (Hard Boundaries), 68 (Acceptance Criteria), 69 (Final Product Vision)

**Status:** Most of the existing codebase follows these principles. This phase validates everything against the full spec.

### Step 6.1 — Extensibility Model

**Spec §63-64:** New contextual states plugin-style, state registry

**Tasks:**
1. Formalize `lib/platform/state-registry.ts`:
   - `registerSystemState(config)` — plugin registration (spec §64)
   - `getRegisteredStates()` — all registered states
   - State manifest file: `lib/platform/states/` directory with individual state configs
2. Add at least 2 example future states: `ELECTION_PERIOD`, `HOLIDAY` (spec §63)
3. Document the state registration API

### Step 6.2 — Final Acceptance Criteria Validation

**Spec §68:** Run through each acceptance criterion

**Tasks:**
1. Branding: themes creatable/previewable/versioned/auditable/contrast-validated ✓
2. Secrets: never exposed unnecessarily, create/rotate/revoke with audit ✓
3. Contextual states: activateable/deactivatable with precedence, critical overrides cosmetic, accessibility modes, explicit text, audited ✓
4. Administration: server-side enforcement, sensitive action authorization, destructive action protection, audit logs, environment distinction ✓
5. Extensibility: new states without redesigning, new content types without restructuring, new integrations through architecture ✓

### Step 6.3 — Documentation & Handoff

**Tasks:**
1. Update `docs/admin-audit.md` with cross-references to implementation files
2. Create `docs/implementation-status.md` mapping each spec section to its implementation
3. Create `docs/admin-development.md` — guide for adding new admin features/modules
4. Update `AGENTS.md` with admin architecture notes

### Step 6.4 — Final Validation

```
npm run typecheck
npm run lint
npm run check
npm run test
npm run test:e2e
npm run test:rls
npm run verify:posture
```

**Verify:**
- [ ] All 69 spec sections mapped to implementation
- [ ] Full `npm run check` passes (all 9 verification scripts)
- [ ] RBAC tests pass
- [ ] All acceptance criteria from spec §68 validated
- [ ] Documentation complete

---

## Cross-Cutting Concerns (applies to all phases)

### Locale-first routing (checklist item 1)
- All new admin pages live under `app/[locale]/(app)/admin/...`
- All links use `localePath(locale, path)` — never bare `/admin/...`
- Run `node scripts/find-bare-hrefs.mjs` at each phase checkpoint

### Defense in depth (checklist items 4-5)
- Every new admin page calls a guard: `requireStaff` or `requireCapability`
- Every new server action calls `assertStaff` or `assertCapability`
- RLS policies on new tables

### i18n (checklist item 6)
- Add strings to `lib/i18n/en-app.ts` and `lib/i18n/fr-app.ts` for every user-visible string
- `fr.ts` typed as `Dictionary` — missing keys are compile errors (enforced by `node scripts/verify-client-dictionary.mjs`)

### Audit logging (spec §19, §55)
- Every admin action writes to `audit_events` or `moderation_log`
- Never store sensitive values in audit metadata (spec §720)
- Audit events include: `event_id`, `actor_id`, `actor_role`, `action`, `resource_type`, `resource_id`, `timestamp`, `request_id`, `source`, `metadata`

### Security (spec §16, §67)
- Secrets never in frontend source, URLs, logs, analytics, API response bodies
- Encrypted at rest
- Transmitted only via secure channels
- Server-side authorization enforced
- Use `lib/security/secrets.ts` (`timingSafeEqual`) for all secret comparisons

### Testing
- Unit tests: `lib/admin/**/*.test.ts` alongside implementation
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`
- RLS harness: `npm run test:rls`

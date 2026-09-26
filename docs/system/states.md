# Platform states — operator guide

**Where:** `/admin/states` (chief only). **Purpose:** put the whole platform
into a named context — a season, maintenance, degradation, recovery — so
branding, widgets, content templates and the admin chrome react as one.

## Concepts

- **Ladder:** every installed state with severity, precedence (higher wins),
  live status, activation routes and an activate/clear control. Unregistered
  DB rows render as text with no action — install them in code first.
- **Effective state:** the highest-precedence *live* state, else synthetic
  `NORMAL`. Every admin page resolves it in the layout (banner + topbar pill
  + CSS tokens); branding composes published tokens with it.
- **Expiry is a hard cutoff:** `isStateLive` ignores expired rows everywhere,
  and the nightly scheduler now **sweeps** them (deactivates + logs).
- **Operational states** (`INCIDENT`, `CRITICAL`) are incident-console
  territory: this tab links to the incident instead of toggling; clearing
  while an incident runs is refused.

## The installed states

| State | Prec. | How it lights |
|---|---|---|
| `NORMAL` | 0 | Baseline — clear everything above it. Never activated directly. |
| `SEASONAL` | 10 | Manual (generic seasonal wrapper). |
| `HOLIDAY` | 11 | Schedule (20 Dec – 5 Jan, seeded) or manual. |
| `BACK_TO_SCHOOL` | 12 | Schedule (1–30 Sep, seeded) or manual. |
| `ELECTION_PERIOD` | 14 | Manual, or a per-election schedule you create (dates vary). |
| `HIGH_ACTIVITY` | 20 | Manual, auto-expires +24h. |
| `MAINTENANCE` | 30 | Manual, auto-expires +24h. |
| `DEGRADED` | 40 | Manual (telemetry hook point — see below). |
| `RECOVERY` | 45 | Manual. |
| `INCIDENT` / `CRITICAL` | 50 / 60 | Incident console only. |

## Daily operation

1. **Light a state:** ladder → Activate → reason (stored in history + audit).
   `HIGH_ACTIVITY`/`MAINTENANCE` clear themselves after 24h; seasonal states
   clear when their window closes **only if the schedule lit them** — a manual
   activation is never silently reverted.
2. **Clear it:** Deactivate (blocked while an incident runs — resolve first).
3. **Schedules:** the table lists annual month/day windows with status and
   last run. Add one per state shape (duplicates are rejected), pause/resume
   with one click, delete freely — deletion is blocked while the state is
   still lit *by that schedule*, so a live season is never orphaned.
4. **Election runbook:** create `ELECTION_PERIOD` schedule (e.g. campaign
   window), enable it, verify the 00:00 UTC run lights it, delete or pause
   after results.

## Automation & schedules (cron)

- `state-schedules` daily 00:00 UTC (`vercel.json`): evaluates windows,
  activates inside / deactivates schedule-lit states outside, sweeps expired
  manual rows, compiles matching content templates (`state_id` + cadence),
  stamps a heartbeat (`36h` grace — watch `/api/ready` / automations strip).
- `state-watchdog` every 15 min: lights `DEGRADED` from live telemetry
  (`getSystemMetrics` — same verdict the dashboard renders), clears it on
  recovery **only when the watchdog lit it** (manual activations are never
  auto-cleared), stands down while an incident is open, never touches
  operational states. Heartbeat grace 1h.
- **Theme bindings:** a state may carry its own published palette
  (`system_state_themes`, managed in the State themes section — published
  themes only). The bound theme becomes the base palette whenever the state
  lights; the state's visual profile still composes on top.
- **Fan-out pause (behavior enforcement):** during `INCIDENT`/`CRITICAL` the
  daily/weekly subscriber digests are skipped (logged, visible in the cron
  result). Staff alerts, transactional mail and publishing are never paused.
- Plugin manifests register idempotently per request (`ensurePluginStatesRegistered`
  in the admin layout, states page and cron). Adding a future state =
  manifest file + `PLUGIN_STATES` entry + migration seed row.

## Data model (for debugging)

- `system_states` (staff-read RLS, service-role writes): flags + `expires_at`.
- `system_state_events`: every transition with actor (null = scheduler) +
  reason + displaced state.
- `state_schedules`: windows + `last_action` (cron-owned) + `last_run_at`.
- `audit_events` `state.*` / `state.schedule_*`: the compliance mirror.
- `system_state_themes`, `content_templates.state_id`: downstream bindings.

## Troubleshooting

- Widget "unregistered": code manifest missing — add + register, the row
  already exists.
- Schedule fired but state dark: check `enabled`, window wrap (Dec→Jan works),
  operational guard (schedules never light `INCIDENT`/`CRITICAL`), and that no
  higher-precedence state is live.
- Expired row still `active=true`: the sweeper clears it on the next 00:00 UTC
  run; reads already ignore it.

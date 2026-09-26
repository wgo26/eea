import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import {
  getActiveIncident,
  getAllStates,
  getRecentStateEvents,
  getStateSchedules,
  getStateThemeBindings,
  loadThemeList,
  type StateEventRow,
  type StateScheduleRow,
  type StateSeverity,
} from '@/lib/admin/queries'
import {
  getRegisteredStates,
  getStatePrecedence,
  getStateVisualProfile,
  NORMAL_STATE_ID,
  type StateActivationRules,
} from '@/lib/platform/state-engine'
import { ensurePluginStatesRegistered } from '@/lib/platform/states/index'
import { STATE_NAME_KEYS, stateNameKey, stateToneClasses } from '@/lib/platform/state-presentation'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { fillCopy, formatDateTime, formatRelative } from '@/lib/admin/format'
import { StateControl, type StateControlLabels } from './state-control'
import { ScheduleManager, type ScheduleManagerLabels } from './schedule-manager'
import { StateThemeManager, type StateThemeManagerLabels } from './state-theme-manager'
import type { Locale } from '@/lib/i18n'

/**
 * Operational controls (plan Phase 4.2/4.3, spec §27/§28/§29) — the operator's
 * view of the state ladder: what is installed, what is lit, where the lights
 * come from, and what happened recently.
 *
 * The page is a read surface plus one control per row; every write goes
 * through `lib/admin/actions/states.ts`, which refuses operational states so
 * INCIDENT/CRITICAL stay incident-console-only and honours two-person control
 * where the spec requires it (spec §44).
 */

/** Incident-console territory — no manual toggle, whichever way the ladder runs. */
const OPERATIONAL_STATES = ['INCIDENT', 'CRITICAL']

const ROUTES: (keyof StateActivationRules)[] = ['manual', 'scheduled', 'automated', 'incident']

function activationRoutes(activation?: Partial<StateActivationRules>): (keyof StateActivationRules)[] {
  return ROUTES.filter((route) => activation?.[route])
}

/**
 * A month/day pair needs a carrier year to format; UTC keeps the server's zone
 * from shifting the day, and any year renders the same "Sep 1" for a window
 * that recurs annually.
 */
function monthDay(month: number, day: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, month - 1, day)),
  )
}

type LadderRow = {
  id: string
  label: string
  severity: StateSeverity
  precedence: number
  active: boolean
  activatedAt: string | null
  expiresAt: string | null
  /** False for a row the DB knows and the engine does not (spec §29). */
  registered: boolean
  routes: (keyof StateActivationRules)[]
}

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.statesPage.title }
}

export default async function Page() {
  // Plugin manifests (HOLIDAY, ELECTION_PERIOD) register idempotently per
  // request — without this the ladder only ever shows the built-ins plus
  // BACK_TO_SCHOOL, no matter what the migrations seeded.
  ensurePluginStatesRegistered()
  const locale = await getRequestLocale()
  const { roles, adminRoles } = await requireCapability('system.owner', '/admin/states')
  const dict = getDictionary(locale)
  const t = dict.admin.statesPage
  const names = dict.admin.states
  const canManageIncidents = effectiveCapabilities(roles, adminRoles).has('incidents.manage')

  const [dbStates, schedules, events, incident, themeBindings, themeList] = await Promise.all([
    getAllStates(),
    getStateSchedules(),
    getRecentStateEvents(12),
    getActiveIncident(),
    getStateThemeBindings(),
    loadThemeList(),
  ])

  /** DB rows carry English seed text, so a known id renders its dictionary name. */
  const labelFor = (id: string, fallback: string) =>
    id in STATE_NAME_KEYS ? names[stateNameKey(id)] : fallback

  const dbById = new Map(dbStates.map((state) => [state.id, state]))
  const registeredIds = new Set(getRegisteredStates().map((config) => config.id))

  const ladder: LadderRow[] = getRegisteredStates().map((config) => {
    const row = dbById.get(config.id)
    return {
      id: config.id,
      label: labelFor(config.id, row?.name ?? config.name),
      severity: row?.severity ?? config.severity,
      precedence: config.precedence,
      active: row?.active ?? false,
      activatedAt: row?.activatedAt ?? null,
      expiresAt: row?.expiresAt ?? null,
      registered: true,
      routes: activationRoutes(config.activation),
    }
  })
  for (const row of dbStates) {
    if (registeredIds.has(row.id)) continue
    ladder.push({
      id: row.id,
      label: row.name,
      severity: row.severity,
      precedence: getStatePrecedence(row.id),
      active: row.active,
      activatedAt: row.activatedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      registered: false,
      routes: [],
    })
  }
  ladder.sort((a, b) => b.precedence - a.precedence)

  const controlLabels: StateControlLabels = {
    activate: t.activate,
    deactivate: t.deactivate,
    activateTitle: t.activateTitle,
    activateDescription: t.activateDescription,
    deactivateTitle: t.deactivateTitle,
    deactivateDescription: t.deactivateDescription,
    reason: t.reason,
    reasonHint: t.reasonHint,
    reasonPlaceholder: t.reasonPlaceholder,
    cancel: dict.admin.common.cancel,
    activatedToast: t.activatedToast,
    deactivatedToast: t.deactivatedToast,
  }

  const columns: Column<LadderRow>[] = [
    {
      key: 'state',
      header: t.colState,
      render: (row) => {
        const tone = stateToneClasses(getStateVisualProfile(row.id).tone)
        return (
          <div className="flex min-w-[160px] items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium">{row.label}</div>
              <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
            </div>
          </div>
        )
      },
    },
    {
      key: 'severity',
      header: t.colSeverity,
      render: (row) => <span className="text-xs">{t.severity[row.severity]}</span>,
      className: 'whitespace-nowrap',
    },
    {
      key: 'priority',
      header: t.colPriority,
      render: (row) => <span className="font-mono text-xs">{row.precedence}</span>,
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'status',
      header: t.colStatus,
      render: (row) => {
        if (!row.active) return <span className="text-xs text-muted-foreground">{t.inactive}</span>
        const tone = stateToneClasses(getStateVisualProfile(row.id).tone)
        return (
          <div className="flex flex-col gap-1">
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone.pill}`}
            >
              {t.active}
            </span>
            {row.activatedAt && (
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {fillCopy(t.since, { value: formatDateTime(row.activatedAt, locale) })}
              </span>
            )}
            {row.expiresAt && (
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {fillCopy(t.expires, { value: formatDateTime(row.expiresAt, locale) })}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'activation',
      header: t.colActivation,
      render: (row) =>
        row.routes.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.routes.map((route) => (
              <span
                key={route}
                className="inline-flex w-fit rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {t.route[route]}
              </span>
            ))}
          </div>
        ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
    },
    {
      key: 'actions',
      header: '',
      render: (row) => {
        if (!row.registered) {
          return <span className="text-xs text-muted-foreground">{t.unregistered}</span>
        }
        if (row.id === NORMAL_STATE_ID) {
          return <span className="text-xs text-muted-foreground">{t.baseline}</span>
        }
        if (OPERATIONAL_STATES.includes(row.id)) {
          const href = localePath(locale, '/admin/incidents')
          return canManageIncidents ? (
            <Link href={href} className="text-xs font-medium whitespace-nowrap text-primary hover:underline">
              {t.incidentOwned}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">{t.incidentOwned}</span>
          )
        }
        // Clearing a state while an incident runs would change nothing visible.
        if (row.active && incident) {
          return <span className="text-xs text-muted-foreground">{t.incidentBlocked}</span>
        }
        return (
          <StateControl
            stateId={row.id}
            stateLabel={row.label}
            active={row.active}
            labels={controlLabels}
          />
        )
      },
      className: 'text-right',
    },
  ]

  const scheduleColumns: Column<StateScheduleRow>[] = [
    {
      key: 'state',
      header: t.colState,
      render: (row) => (
        <div className="min-w-[160px]">
          <div className="text-sm font-medium">{labelFor(row.stateId, row.label)}</div>
          <div className="text-xs text-muted-foreground">{row.label}</div>
        </div>
      ),
    },
    {
      key: 'window',
      header: t.colWindow,
      render: (row) => (
        <span className="text-xs whitespace-nowrap">
          {`${monthDay(row.startMonth, row.startDay, locale)}${t.windowJoin}${monthDay(
            row.endMonth,
            row.endDay,
            locale,
          )}`}
        </span>
      ),
    },
    {
      key: 'enabled',
      header: t.colScheduleStatus,
      render: (row) => (
        <span
          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
            row.enabled
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {row.enabled ? t.enabled : t.disabled}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'lastRun',
      header: t.colLastRun,
      render: (row) =>
        row.lastAction ? (
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {fillCopy(t.lastRan, {
              action: row.lastAction === 'activated' ? t.eventActivated : t.eventDeactivated,
              value: formatRelative(row.lastRunAt, locale),
            })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t.neverRun}</span>
        ),
      className: 'whitespace-nowrap',
    },
  ]

  // Bindable states: registered, never the baseline or the incident
  // console's operational states.
  const themeStates = getRegisteredStates()
    .filter((config) => config.id !== NORMAL_STATE_ID && !OPERATIONAL_STATES.includes(config.id))
    .map((config) => ({ id: config.id, label: labelFor(config.id, config.name) }))
  const publishedThemes = themeList
    .filter((theme) => theme.status === 'published')
    .map((theme) => ({ id: theme.id, name: theme.name, version: theme.version }))

  const themeLabels: StateThemeManagerLabels = {
    bound: t.themeBound,
    unbound: t.themeUnbound,
    selectTheme: t.themeSelect,
    save: t.themeSave,
    clear: t.themeClear,
    clearTitle: t.themeClearTitle,
    clearBody: t.themeClearBody,
    cancel: dict.admin.common.cancel,
    savedToast: t.toastThemeSaved,
    clearedToast: t.toastThemeCleared,
  }

  const eventLabels: Record<string, string> = {
    activated: t.eventActivated,
    deactivated: t.eventDeactivated,
    restored: t.eventRestored,
    escalated: t.eventEscalated,
  }
  const eventLabel = (event: StateEventRow) => eventLabels[event.action] ?? event.action

  // States a new schedule may target: registered, scheduled-route, and never
  // the baseline or the incident console's operational states.
  const schedulable = getRegisteredStates()
    .filter(
      (config) =>
        config.activation?.scheduled &&
        config.id !== NORMAL_STATE_ID &&
        !OPERATIONAL_STATES.includes(config.id),
    )
    .map((config) => ({ id: config.id, label: labelFor(config.id, config.name) }))

  const scheduleLabels: ScheduleManagerLabels = {
    state: t.scheduleState,
    name: t.scheduleName,
    namePlaceholder: t.scheduleNamePlaceholder,
    start: t.scheduleStart,
    end: t.scheduleEnd,
    month: t.scheduleMonth,
    day: t.scheduleDay,
    add: t.scheduleAdd,
    addedToast: t.toastScheduleAdded,
    updatedToast: t.toastScheduleUpdated,
    deletedToast: t.toastScheduleDeleted,
    enable: t.scheduleEnable,
    disable: t.scheduleDisable,
    delete: t.scheduleDelete,
    deleteTitle: t.scheduleDeleteTitle,
    deleteBody: t.scheduleDeleteBody,
    cancel: dict.admin.common.cancel,
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{t.ladderHeading}</h2>
          <p className="text-xs text-muted-foreground">{t.ladderHint}</p>
        </div>
        <DataTable
          rows={ladder}
          rowKey={(row) => row.id}
          columns={columns}
          emptyState={<EmptyState message={t.empty} />}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{t.schedulesHeading}</h2>
          <p className="text-xs text-muted-foreground">{t.schedulesHint}</p>
        </div>
        <DataTable
          rows={schedules}
          rowKey={(row) => row.id}
          columns={scheduleColumns}
          emptyState={<EmptyState message={t.schedulesEmpty} />}
        />
        <div>
          <h3 className="text-sm font-medium text-foreground">{t.scheduleAddHeading}</h3>
          <p className="text-xs text-muted-foreground">{t.scheduleAddHint}</p>
        </div>
        <ScheduleManager schedules={schedules} schedulable={schedulable} labels={scheduleLabels} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{t.themeHeading}</h2>
          <p className="text-xs text-muted-foreground">{t.themeHint}</p>
        </div>
        <StateThemeManager
          states={themeStates}
          bindings={themeBindings}
          themes={publishedThemes}
          labels={themeLabels}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{t.historyHeading}</h2>
          <p className="text-xs text-muted-foreground">{t.historyHint}</p>
        </div>
        {events.length === 0 ? (
          <EmptyState message={t.historyEmpty} />
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="text-sm font-medium">{labelFor(event.stateId, event.stateId)}</span>
                <span className="inline-flex rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                  {eventLabel(event)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt, locale)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.actorName
                    ? fillCopy(t.byActor, { name: event.actorName })
                    : t.bySchedule}
                </span>
                {event.previousStateId && (
                  <span className="text-xs text-muted-foreground">
                    {fillCopy(t.previousLabel, {
                      state: labelFor(event.previousStateId, event.previousStateId),
                    })}
                  </span>
                )}
                {event.reason && (
                  <span className="w-full text-xs text-muted-foreground">{event.reason}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

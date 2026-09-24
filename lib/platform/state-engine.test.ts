import { describe, expect, it } from 'vitest'
import {
  NORMAL_STATE,
  canActivateState,
  getEffectiveState,
  getStatePrecedence,
  getStateVisualProfile,
  isStateLive,
  resolveActiveStates,
  toSystemState,
  type SystemState,
} from './state-engine'

function state(id: string, patch: Partial<SystemState> = {}): SystemState {
  return {
    id,
    name: id,
    severity: 'info',
    active: true,
    visualProfile: 'default',
    affectedModules: [],
    behaviorProfile: {},
    accessibilityProfile: 'standard',
    ...patch,
  }
}

describe('state engine precedence (spec §29)', () => {
  it('orders the ladder NORMAL < SEASONAL < HIGH_ACTIVITY < … < CRITICAL', () => {
    const ladder = [
      'NORMAL',
      'SEASONAL',
      'HIGH_ACTIVITY',
      'MAINTENANCE',
      'DEGRADED',
      'RECOVERY',
      'INCIDENT',
      'CRITICAL',
    ]
    const weights = ladder.map(getStatePrecedence)
    const sorted = [...weights].sort((a, b) => a - b)
    expect(weights).toEqual(sorted)
    expect(new Set(weights).size).toBe(weights.length)
  })

  it('sorts active states highest-precedence first', () => {
    const rows = [state('SEASONAL'), state('CRITICAL'), state('HIGH_ACTIVITY'), state('INCIDENT')]
    expect(resolveActiveStates(rows).map((s) => s.id)).toEqual([
      'CRITICAL',
      'INCIDENT',
      'HIGH_ACTIVITY',
      'SEASONAL',
    ])
  })

  it('ignores inactive and expired states, including the effective pick', () => {
    const past = '2000-01-01T00:00:00.000Z'
    const rows = [
      state('CRITICAL', { active: false }),
      state('INCIDENT', { expiresAt: past }),
      state('SEASONAL', { expiresAt: '2099-01-01T00:00:00.000Z' }),
    ]
    expect(resolveActiveStates(rows).map((s) => s.id)).toEqual(['SEASONAL'])
    expect(getEffectiveState(rows).id).toBe('SEASONAL')
  })

  it('falls back to the synthetic NORMAL state when nothing is live', () => {
    expect(getEffectiveState([])).toEqual(NORMAL_STATE)
    expect(getEffectiveState([state('MAINTENANCE', { active: false })])).toEqual(NORMAL_STATE)
    expect(isStateLive(NORMAL_STATE)).toBe(true)
  })

  it('does not mutate the input array', () => {
    const rows = [state('SEASONAL'), state('CRITICAL')]
    resolveActiveStates(rows)
    expect(rows.map((s) => s.id)).toEqual(['SEASONAL', 'CRITICAL'])
  })
})

describe('state visual profiles (spec §25/§30)', () => {
  it('returns no token overrides for NORMAL and unknown states', () => {
    expect(getStateVisualProfile('NORMAL').tokens).toEqual({})
    expect(getStateVisualProfile('does-not-exist')).toEqual(getStateVisualProfile('normal'))
  })

  it('gives CRITICAL high-contrast tokens and reduced motion', () => {
    const critical = getStateVisualProfile('CRITICAL')
    expect(critical.tone).toBe('critical')
    expect(critical.reduceMotion).toBe(true)
    expect(critical.tokens['--radius']).toBeTruthy()
    expect(critical.tokens['--primary']).toBeTruthy()
  })

  it('marks warning states as warning tone', () => {
    expect(getStateVisualProfile('DEGRADED').tone).toBe('warning')
    expect(getStateVisualProfile('INCIDENT').tone).toBe('critical')
  })
})

describe('row normalization and activation gate', () => {
  it('narrows a snake_case DB row', () => {
    const row = toSystemState({
      id: 'CRITICAL',
      name: 'Critical',
      severity: 'critical',
      active: true,
      visual_profile: 'critical',
      affected_modules: ['publishing', 'media'],
      behavior_profile: { motion: 'reduced', notifications: 'prominent' },
      accessibility_profile: 'high-contrast',
      activated_at: '2026-09-23T10:00:00.000Z',
      expires_at: null,
    })
    expect(row.severity).toBe('critical')
    expect(row.affectedModules).toEqual(['publishing', 'media'])
    expect(row.behaviorProfile.motion).toBe('reduced')
    expect(toSystemState({ id: 'X' }).severity).toBe('normal')
  })

  it('gates activation on the system.configure capability and open incidents', () => {
    expect(canActivateState({ allowed: false, stateId: 'SEASONAL' }).ok).toBe(false)
    expect(canActivateState({ allowed: true, stateId: 'UNKNOWN' }).ok).toBe(false)
    expect(canActivateState({ allowed: true, stateId: 'CRITICAL' }).ok).toBe(true)
    expect(
      canActivateState({ allowed: true, stateId: 'NORMAL', hasActiveIncident: true }).ok,
    ).toBe(false)
    expect(
      canActivateState({ allowed: true, stateId: 'NORMAL', hasActiveIncident: false }).ok,
    ).toBe(true)
  })
})

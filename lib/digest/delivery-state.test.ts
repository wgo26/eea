import { describe, expect, it } from 'vitest'
import { canAutomaticallyRetry, classifyDeliveryOutcome } from './delivery-state'

describe('digest delivery retry policy', () => {
  it('distinguishes confirmed failures from uncertain provider outcomes', () => {
    expect(classifyDeliveryOutcome({ delivered: true })).toBe('sent')
    expect(classifyDeliveryOutcome({ delivered: false })).toBe('failed')
    expect(classifyDeliveryOutcome({ delivered: false, uncertain: true })).toBe('unknown')
  })

  it('automatically retries only queued and confirmed-failed deliveries', () => {
    expect(canAutomaticallyRetry('pending')).toBe(true)
    expect(canAutomaticallyRetry('failed')).toBe(true)
    expect(canAutomaticallyRetry('sending')).toBe(false)
    expect(canAutomaticallyRetry('sent')).toBe(false)
    expect(canAutomaticallyRetry('unknown')).toBe(false)
    expect(canAutomaticallyRetry('cancelled')).toBe(false)
  })
})

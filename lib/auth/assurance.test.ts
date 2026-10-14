import { describe, expect, it } from 'vitest'
import { requiresMfaChallenge } from './assurance'

describe('requiresMfaChallenge', () => {
  it('requires a verified factor when the current session is only aal1', () => {
    expect(requiresMfaChallenge('aal1', 'aal2')).toBe(true)
  })

  it('does not challenge an aal2 session or an account without a verified factor', () => {
    expect(requiresMfaChallenge('aal2', 'aal2')).toBe(false)
    expect(requiresMfaChallenge('aal1', 'aal1')).toBe(false)
  })
})

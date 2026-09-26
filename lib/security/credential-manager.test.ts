import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('no database in unit tests')
  },
}))

const HEX_KEY = '0'.repeat(63) + '1'
const B64_KEY = Buffer.from('a'.repeat(32)).toString('base64')

async function loadModule() {
  vi.resetModules()
  return await import('./credential-manager')
}

beforeEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY
})

describe('isSecretStorageConfigured', () => {
  it('is false without a key and true with a valid hex or base64 key', async () => {
    const { isSecretStorageConfigured } = await loadModule()
    expect(isSecretStorageConfigured()).toBe(false)
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'not-a-key'
    expect(isSecretStorageConfigured()).toBe(false)
    process.env.CREDENTIAL_ENCRYPTION_KEY = HEX_KEY
    expect(isSecretStorageConfigured()).toBe(true)
    process.env.CREDENTIAL_ENCRYPTION_KEY = B64_KEY
    expect(isSecretStorageConfigured()).toBe(true)
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips through AES-256-GCM', async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = HEX_KEY
    const { encryptSecret, decryptSecret } = await loadModule()
    const sealed = encryptSecret('correct horse battery staple')
    expect(sealed.split('.')).toHaveLength(4)
    expect(sealed).not.toContain('correct horse')
    expect(decryptSecret(sealed)).toBe('correct horse battery staple')
  })

  it('uses a fresh IV per encryption', async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = HEX_KEY
    const { encryptSecret } = await loadModule()
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('rejects tampered payloads and unknown formats', async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = HEX_KEY
    const { encryptSecret, decryptSecret } = await loadModule()
    const sealed = encryptSecret('value')
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => decryptSecret(parts.join('.'))).toThrow()
    expect(() => decryptSecret('garbage')).toThrow()
  })

  it('cannot be decrypted with a different key', async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = HEX_KEY
    const first = await loadModule()
    const sealed = first.encryptSecret('value')
    process.env.CREDENTIAL_ENCRYPTION_KEY = B64_KEY
    const second = await loadModule()
    expect(() => second.decryptSecret(sealed)).toThrow()
  })

  it('throws a helpful error when no key is configured', async () => {
    const { encryptSecret } = await loadModule()
    expect(() => encryptSecret('value')).toThrow(/CREDENTIAL_ENCRYPTION_KEY/)
  })
})

describe('generateSecret', () => {
  it('produces URL-safe 32-byte secrets by default', async () => {
    const { generateSecret } = await loadModule()
    const a = generateSecret()
    const b = generateSecret()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(a, 'base64url')).toHaveLength(32)
  })
})

describe('effectiveCredentialStatus', () => {
  it('derives expired from a past expiry without touching the stored row', async () => {
    const { effectiveCredentialStatus } = await loadModule()
    expect(
      effectiveCredentialStatus({ status: 'active', expiresAt: new Date(Date.now() - 1000).toISOString() }),
    ).toBe('expired')
    expect(
      effectiveCredentialStatus({ status: 'active', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
    ).toBe('active')
    expect(effectiveCredentialStatus({ status: 'disabled', expiresAt: null })).toBe('disabled')
    expect(effectiveCredentialStatus({ status: 'revoked', expiresAt: null })).toBe('revoked')
  })
})

describe('nextRotationDueAt', () => {
  it('adds the policy interval to the last update, null without a policy', async () => {
    const { nextRotationDueAt } = await loadModule()
    const base = {
      id: 'id',
      name: 'n',
      provider: 'p',
      category: null,
      status: 'active',
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      lastUsedAt: null,
      expiresAt: null,
      notes: null,
      version: 2,
    } as const
    expect(nextRotationDueAt({ ...base, rotationPolicy: { intervalDays: null } })).toBeNull()
    expect(nextRotationDueAt({ ...base, rotationPolicy: { intervalDays: 90 } })).toBe(
      new Date(Date.parse('2026-02-01T00:00:00.000Z') + 90 * 86_400_000).toISOString(),
    )
  })
})

describe('deriveRotationCycle', () => {
  it('treats creation as the generate step for a never-rotated credential', async () => {
    const { deriveRotationCycle } = await loadModule()
    const cycle = deriveRotationCycle(
      [{ action: 'created', createdAt: '2026-01-01T00:00:00.000Z', actorId: 'u1' }],
      1,
    )
    expect(cycle.steps[0]).toMatchObject({ step: 'generate', status: 'done' })
    expect(cycle.steps[1].status).toBe('current')
    expect(cycle.complete).toBe(false)
  })

  it('opens a new cycle at the latest rotation and folds the steps in order', async () => {
    const { deriveRotationCycle } = await loadModule()
    const cycle = deriveRotationCycle(
      [
        { action: 'created', createdAt: '2026-01-01T00:00:00.000Z', actorId: 'u1' },
        { action: 'rotated', createdAt: '2026-03-01T00:00:00.000Z', actorId: 'u1' },
        { action: 'validated', createdAt: '2026-03-01T00:01:00.000Z', actorId: 'u1' },
        { action: 'deployed', createdAt: '2026-03-01T00:02:00.000Z', actorId: 'u1' },
      ],
      2,
    )
    const statusOf = (step: string) => cycle.steps.find((s) => s.step === step)?.status
    expect(statusOf('generate')).toBe('done')
    expect(statusOf('validate')).toBe('done')
    expect(statusOf('deploy')).toBe('done')
    expect(statusOf('verify')).toBe('current')
    expect(cycle.startedAt).toBe('2026-03-01T00:00:00.000Z')
    expect(cycle.complete).toBe(false)
  })

  it('marks a failed validation as failed+current and completes a full cycle', async () => {
    const { deriveRotationCycle } = await loadModule()
    const failed = deriveRotationCycle(
      [
        { action: 'rotated', createdAt: '2026-03-01T00:00:00.000Z', actorId: 'u1' },
        { action: 'validation_failed', createdAt: '2026-03-01T00:01:00.000Z', actorId: 'u1' },
      ],
      2,
    )
    expect(failed.steps.find((s) => s.step === 'validate')).toMatchObject({ status: 'current' })
    const full = deriveRotationCycle(
      [
        { action: 'rotated', createdAt: '2026-03-01T00:00:00.000Z', actorId: 'u1' },
        { action: 'validated', createdAt: '2026-03-01T00:01:00.000Z', actorId: 'u1' },
        { action: 'deployed', createdAt: '2026-03-01T00:02:00.000Z', actorId: 'u1' },
        { action: 'verified', createdAt: '2026-03-01T00:03:00.000Z', actorId: 'u1' },
        { action: 'old_revoked', createdAt: '2026-03-01T00:04:00.000Z', actorId: 'u1' },
      ],
      2,
    )
    expect(full.complete).toBe(true)
    expect(full.steps.every((s) => s.status === 'done')).toBe(true)
  })
})

describe('isValidExpiry', () => {
  it('accepts future dates only', async () => {
    const { isValidExpiry } = await loadModule()
    expect(isValidExpiry(new Date(Date.now() + 86_400_000).toISOString())).toBe(true)
    expect(isValidExpiry(new Date(Date.now() - 86_400_000).toISOString())).toBe(false)
    expect(isValidExpiry('not-a-date')).toBe(false)
  })
})

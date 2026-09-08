import { describe, expect, it } from 'vitest'
import { revealSellerContact } from './actions'

describe('revealSellerContact server action', () => {
    it('rejects invalid or empty listing IDs', async () => {
        const emptyResult = await revealSellerContact('')
        expect(emptyResult.ok).toBe(false)
        if (!emptyResult.ok) {
            expect(emptyResult.error).toBe('not_found')
        }

        const nullResult = await revealSellerContact(null as unknown as string)
        expect(nullResult.ok).toBe(false)
        if (!nullResult.ok) {
            expect(nullResult.error).toBe('not_found')
        }
    })
})

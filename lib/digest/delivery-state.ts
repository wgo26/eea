export type DigestDeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'cancelled'

export function classifyDeliveryOutcome(result: { delivered: boolean; uncertain?: boolean }): DigestDeliveryStatus {
  if (result.delivered) return 'sent'
  return result.uncertain ? 'unknown' : 'failed'
}

export function canAutomaticallyRetry(status: DigestDeliveryStatus): boolean {
  return status === 'pending' || status === 'failed'
}

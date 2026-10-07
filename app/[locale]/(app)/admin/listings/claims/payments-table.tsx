'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmPromotionIntent,
  confirmSubscriptionIntent,
  type PendingIntent,
} from '@/lib/billing/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['businessClaims']

const confirmBtn =
  'inline-flex min-h-[36px] items-center rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50'

/**
 * Pending MoMo payments: staff confirms money that arrived without a webhook
 * (same precedent as manual advertiser invoicing). Confirmation activates the
 * subscription/promotion immediately and is audited like everything else.
 */
export function PaymentsTable({ intents, copy }: { intents: PendingIntent[]; copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function confirm(intent: PendingIntent) {
    setBusy(intent.id)
    const res =
      intent.kind === 'subscription'
        ? await confirmSubscriptionIntent(intent.id)
        : await confirmPromotionIntent(intent.id)
    setBusy(null)
    if (res.ok) {
      addToast(copy.toastPaymentConfirmed, 'success')
      router.refresh()
    } else addToast(res.error, 'error')
  }

  if (intents.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.paymentsEmpty}</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-3xl text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">{copy.colBusiness}</th>
            <th className="px-3 py-2">{copy.colAmount}</th>
            <th className="px-3 py-2">{copy.colReference}</th>
            <th className="px-3 py-2">{copy.colReceived}</th>
            <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {intents.map((intent) => (
            <tr key={intent.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">
                <p className="font-semibold">{intent.label}</p>
                <p className="text-xs text-muted-foreground">
                  {intent.kind === 'subscription' ? 'Pro' : 'Boost'} · {intent.provider ?? 'momo'}
                  {intent.number ? ` · ${intent.number}` : ''}
                </p>
              </td>
              <td className="px-3 py-2 font-semibold">{intent.amountXaf} XAF</td>
              <td className="px-3 py-2 font-mono text-xs">{intent.reference}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {new Date(intent.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void confirm(intent)}
                  className={confirmBtn}
                >
                  {busy === intent.id ? '…' : copy.paymentsConfirm}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

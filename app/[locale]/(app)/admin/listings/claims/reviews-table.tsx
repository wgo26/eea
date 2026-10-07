'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveBusinessReview,
  rejectBusinessReview,
  type ReviewRow,
} from '@/lib/professionals/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['businessClaims']

const approveBtn =
  'inline-flex min-h-[36px] items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50'
const ghostBtn =
  'inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50'

/** Pending neighbour reviews: publish the vouches, reject the noise. */
export function ReviewsTable({ reviews, copy }: { reviews: ReviewRow[]; copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function run(id: string, approve: boolean) {
    setBusy(id)
    const res = approve ? await approveBusinessReview(id) : await rejectBusinessReview(id)
    setBusy(null)
    if (res.ok) {
      addToast(approve ? copy.toastReviewApproved : copy.toastReviewRejected, 'success')
      router.refresh()
    } else addToast(res.error, 'error')
  }

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">{copy.reviewsEmpty}</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-3xl text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">{copy.colBusiness}</th>
            <th className="px-3 py-2">{copy.colReviewer}</th>
            <th className="px-3 py-2">{copy.colRating}</th>
            <th className="px-3 py-2">{copy.colReceived}</th>
            <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <td className="px-3 py-2">
                <p className="font-semibold">{r.businessName ?? r.businessId.slice(0, 8)}</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">{r.body}</p>
              </td>
              <td className="px-3 py-2">{r.reviewerName}</td>
              <td className="px-3 py-2 font-semibold">{r.rating}/5</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex gap-1.5">
                  <button type="button" disabled={busy !== null} onClick={() => void run(r.id, true)} className={approveBtn}>
                    {copy.approve}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void run(r.id, false)} className={ghostBtn}>
                    {copy.reject}
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

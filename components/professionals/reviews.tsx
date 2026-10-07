"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { submitBusinessReview } from "@/lib/professionals/actions";
import type { Dictionary } from "@/lib/i18n";
import type { BusinessReview } from "@/lib/queries/businesses";

type Copy = Dictionary["professionals"];

/** Read-only star aggregate (★ 4.5 · 12 reviews). */
export function RatingStars({
  avg,
  count,
  copy,
  className,
}: {
  avg: number | null;
  count: number;
  copy: Copy;
  className?: string;
}) {
  if (avg == null || count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${className ?? ""}`}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
      {copy.ratingOutOf.replace("{avg}", String(avg)).replace("{n}", String(count))}
    </span>
  );
}

/** Approved review list (public rows only — staff see the queue in admin). */
export function ReviewList({ reviews }: { reviews: BusinessReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="grid gap-3">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border bg-card p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{r.reviewerName}</span>
            <span className="inline-flex items-center gap-0.5" aria-label={`${r.rating}/5`}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-3 w-3 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                  aria-hidden
                />
              ))}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Neighbour review form: open intake with honeypot + caps, staff approval
 * before anything shows. Guests welcome — hiring the pro is the credential.
 */
export function ReviewForm({ businessId, copy }: { businessId: string; copy: Copy }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const inputCls =
    "h-11 min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await submitBusinessReview({ businessId, reviewerName: name, rating, body });
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
        {copy.reviewDone}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid max-w-2xl gap-3 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-extrabold">{copy.reviewCta}</h3>
      <input type="text" name="website" autoComplete="off" tabIndex={-1} className="hidden" aria-hidden onChange={() => {}} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">
          {copy.reviewName}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className={inputCls} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {copy.reviewRating}
          <span className="inline-flex items-center gap-1" role="radiogroup" aria-label={copy.reviewRating}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={rating === s}
                aria-label={`${s}/5`}
                onClick={() => setRating(s)}
                className="min-h-[44px] min-w-[44px] rounded-md p-1 hover:bg-accent"
              >
                <Star className={`h-5 w-5 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} aria-hidden />
              </button>
            ))}
          </span>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium">
        {copy.reviewBody}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          required
          maxLength={2000}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] max-w-xs rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? copy.reviewSending : copy.reviewSubmit}
      </button>
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </form>
  );
}

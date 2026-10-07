"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { toggleRsvp } from "@/lib/live/actions";

export type RsvpCopy = {
  going: string;
  cancel: string;
  count: string;
  signIn: string;
};

/** "I'm going" toggle with a public headcount (no attendee list leaks). */
export function RsvpButton({
  contentItemId,
  initialGoing,
  initialCount,
  signedIn,
  copy,
}: {
  contentItemId: string;
  initialGoing: boolean;
  initialCount: number;
  signedIn: boolean;
  copy: RsvpCopy;
}) {
  const [going, setGoing] = useState(initialGoing);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    if (!signedIn) {
      setNotice(copy.signIn);
      return;
    }
    setBusy(true);
    const res = await toggleRsvp(contentItemId);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setGoing(res.going);
    setCount(res.count);
    setNotice(null);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={going}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
            going
              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <CalendarCheck className="h-4 w-4" aria-hidden />
          {going ? copy.cancel : copy.going}
        </button>
        <span className="text-xs text-muted-foreground" role="status">
          {copy.count.replace("{n}", String(count))}
        </span>
      </span>
      {notice ? (
        <span role="status" className="text-xs text-muted-foreground">
          {notice}
        </span>
      ) : null}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, ChevronDown } from "lucide-react";
import { cancelEventReminder, getReminderState, setEventReminder } from "@/lib/reminders/actions";
import type { Dictionary } from "@/lib/i18n";

type RemindersCopy = Dictionary["reminders"];

const OFFSETS = [
    { ms: 3_600_000, key: "oneHour" },
    { ms: 86_400_000, key: "oneDay" },
    { ms: 7 * 86_400_000, key: "oneWeek" },
] as const;

// Module-scope helper so the render stays pure (react-hooks/purity flags
// Date.now() inside render — same pattern as the dashboard SLA helper).
function isPastEvent(eventStartsAt: string): boolean {
    const starts = Date.parse(eventStartsAt);
    return Number.isNaN(starts) || starts <= Date.now();
}

/**
 * "Remind me" for culture events: pick 1h/1d/1w before the start; the hourly
 * cron delivers the nudge through the user's notification channels.
 * Guests get a sign-in hint; past events render nothing.
 */
export function ReminderButton({
    contentItemId,
    eventStartsAt,
    copy,
}: {
    contentItemId: string;
    eventStartsAt: string;
    copy: RemindersCopy;
}) {
    const [remindAt, setRemindAt] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const past = isPastEvent(eventStartsAt);

    useEffect(() => {
        if (past) return;
        let cancelled = false;
        void getReminderState(contentItemId).then((state) => {
            if (!cancelled) setRemindAt(state.remindAt);
        });
        return () => {
            cancelled = true;
        };
    }, [contentItemId, past]);

    if (past) return null;

    async function choose(offsetMs: number) {
        setBusy(true);
        const result = await setEventReminder(contentItemId, eventStartsAt, offsetMs);
        setBusy(false);
        setOpen(false);
        if (!result.ok) {
            setNotice(result.error === "Not authenticated." ? copy.signIn : result.error || copy.error);
            return;
        }
        setRemindAt(result.remindAt);
        setNotice(copy.set);
    }

    async function cancel() {
        setBusy(true);
        const result = await cancelEventReminder(contentItemId);
        setBusy(false);
        if (!result.ok) {
            setNotice(result.error || copy.error);
            return;
        }
        setRemindAt(null);
        setNotice(copy.cancelled);
    }

    return (
        <span className="relative inline-flex flex-col">
            <span className="inline-flex gap-1.5">
                {remindAt ? (
                    <button
                        type="button"
                        onClick={cancel}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                    >
                        <BellOff className="h-3.5 w-3.5" aria-hidden />
                        {copy.cancelReminder}
                    </button>
                ) : (
                    <span className="relative inline-flex">
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            aria-expanded={open}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                            <Bell className="h-3.5 w-3.5" aria-hidden />
                            {copy.remindMe}
                            <ChevronDown className="h-3 w-3" aria-hidden />
                        </button>
                        {open ? (
                            <span className="absolute left-0 top-full z-10 mt-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
                                {OFFSETS.map((o) => (
                                    <button
                                        key={o.key}
                                        type="button"
                                        onClick={() => choose(o.ms)}
                                        className="flex w-full items-center rounded px-2.5 py-1.5 text-xs font-medium text-popover-foreground transition-colors hover:bg-accent"
                                    >
                                        {copy[o.key]}
                                    </button>
                                ))}
                            </span>
                        ) : null}
                    </span>
                )}
            </span>
            {notice ? (
                <span role="status" className="mt-1 text-[11px] text-muted-foreground">
                    {notice}
                </span>
            ) : null}
        </span>
    );
}

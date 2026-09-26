"use client";

import { useState } from "react";
import { CalendarDays, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * List / month toggle for the events index: server-rendered list stays as
 *-is; the calendar renders on demand when the user switches views.
 */
export function EventsViewToggle({
    listLabel,
    calendarLabel,
    calendar,
    children,
}: {
    listLabel: string;
    calendarLabel: string;
    calendar: React.ReactNode;
    children: React.ReactNode;
}) {
    const [view, setView] = useState<"list" | "month">("list");

    function tab(next: "list" | "month", label: string, Icon: typeof LayoutGrid) {
        const active = view === next;
        return (
            <button
                type="button"
                onClick={() => setView(next)}
                aria-pressed={active}
                className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                    active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                )}
            >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
            </button>
        );
    }

    return (
        <div>
            <div className="mb-6 flex items-center gap-1.5">
                {tab("list", listLabel, LayoutGrid)}
                {tab("month", calendarLabel, CalendarDays)}
            </div>
            {view === "month" ? calendar : children}
        </div>
    );
}

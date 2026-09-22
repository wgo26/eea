"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EventData } from "@/lib/queries/culture";

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Month-grid calendar for culture events. Days with events get dots +
 * linked titles below the grid; navigation stays within ±12 months.
 */
export function EventsCalendar({ events, locale }: { events: EventData[]; locale: string }) {
    const [month, setMonth] = useState(() => startOfMonth(new Date()));

    const byDay = new Map<string, EventData[]>();
    for (const event of events) {
        if (!event.eventDate) continue;
        const parsed = new Date(event.eventDate);
        if (Number.isNaN(parsed.getTime())) continue;
        const key = dayKey(parsed);
        byDay.set(key, [...(byDay.get(key) ?? []), event]);
    }

    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: (Date | null)[] = [
        ...Array<null>(firstWeekday).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
    ];

    const monthLabel = month.toLocaleDateString(locale.startsWith("fr") ? "fr-FR" : "en-GB", {
        month: "long",
        year: "numeric",
    });
    const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
        new Date(2026, 0, 5 + i).toLocaleDateString(locale.startsWith("fr") ? "fr-FR" : "en-GB", {
            weekday: "short",
        }),
    );

    const monthEvents = events.filter((e) => {
        if (!e.eventDate) return false;
        const parsed = new Date(e.eventDate);
        return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
    });

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-extrabold capitalize">{monthLabel}</h2>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={() => setMonth((m) => addMonths(m, -1))}
                        aria-label="Previous month"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                        type="button"
                        onClick={() => setMonth((m) => addMonths(m, 1))}
                        aria-label="Next month"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel}>
                {weekdayLabels.map((d) => (
                    <div key={d} className="pb-1 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {d}
                    </div>
                ))}
                {cells.map((date, i) => {
                    if (!date) return <div key={`empty-${i}`} />;
                    const key = dayKey(date);
                    const dayEvents = byDay.get(key) ?? [];
                    const isToday = dayKey(new Date()) === key;
                    return (
                        <div
                            key={key}
                            role="gridcell"
                            className={`min-h-14 rounded-lg border p-1.5 text-xs sm:min-h-20 ${
                                isToday ? "border-primary bg-primary/5" : "border-border bg-card"
                            }`}
                        >
                            <span className={`font-bold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                {date.getDate()}
                            </span>
                            <div className="mt-1 hidden space-y-1 sm:block">
                                {dayEvents.slice(0, 3).map((e) => (
                                    <Link
                                        key={e.id}
                                        href={e.href}
                                        className="block truncate rounded bg-primary/10 px-1 py-0.5 text-xs font-medium text-primary hover:underline"
                                    >
                                        {e.title}
                                    </Link>
                                ))}
                                {dayEvents.length > 3 ? (
                                    <span className="block text-xs text-muted-foreground">
                                        +{dayEvents.length - 3}
                                    </span>
                                ) : null}
                            </div>
                            {dayEvents.length > 0 ? (
                                <span className="mt-1 flex gap-0.5 sm:hidden" aria-hidden>
                                    {dayEvents.slice(0, 3).map((e) => (
                                        <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-primary" />
                                    ))}
                                </span>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {monthEvents.length > 0 ? (
                <ul className="mt-4 space-y-2 sm:hidden">
                    {monthEvents.map((e) => (
                        <li key={e.id}>
                            <Link href={e.href} className="block truncate text-sm font-medium text-primary hover:underline">
                                {new Date(e.eventDate as string).getDate()} · {e.title}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

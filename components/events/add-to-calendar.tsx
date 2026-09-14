"use client";

import { useState } from "react";
import { CalendarPlus, ChevronDown } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

type CalendarCopy = Dictionary["calendar"];

function icsDate(iso: string): string {
    return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcs(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Add-to-calendar for events: .ics download (Apple/Outlook) + Google
 * Calendar link. Pure client-side — no backend, works offline.
 */
export function AddToCalendar({
    title,
    startsAt,
    endsAt,
    venue,
    url,
    copy,
}: {
    title: string;
    startsAt: string;
    endsAt: string | null;
    venue: string | null;
    url: string;
    copy: CalendarCopy;
}) {
    const [open, setOpen] = useState(false);

    const end = endsAt ?? new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString();

    function downloadIcs() {
        const lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Eagle Eye Africa//Events//EN",
            "BEGIN:VEVENT",
            `UID:${Date.parse(startsAt)}-${title.length}@eagleeyeafrica`,
            `DTSTAMP:${icsDate(new Date().toISOString())}`,
            `DTSTART:${icsDate(startsAt)}`,
            `DTEND:${icsDate(end)}`,
            `SUMMARY:${escapeIcs(title)}`,
            venue ? `LOCATION:${escapeIcs(venue)}` : null,
            `URL:${escapeIcs(url)}`,
            "END:VEVENT",
            "END:VCALENDAR",
        ].filter(Boolean);
        const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = "event.ics";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
        setOpen(false);
    }

    const googleHref =
        "https://calendar.google.com/calendar/render?action=TEMPLATE" +
        `&text=${encodeURIComponent(title)}` +
        `&dates=${icsDate(startsAt)}/${icsDate(end)}` +
        (venue ? `&location=${encodeURIComponent(venue)}` : "") +
        `&details=${encodeURIComponent(url)}`;

    return (
        <span className="relative inline-flex">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                {copy.add}
                <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
            {open ? (
                <span className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
                    <button
                        type="button"
                        onClick={downloadIcs}
                        className="flex w-full items-center rounded px-2.5 py-1.5 text-xs font-medium text-popover-foreground transition-colors hover:bg-accent"
                    >
                        {copy.downloadIcs}
                    </button>
                    <a
                        href={googleHref}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center rounded px-2.5 py-1.5 text-xs font-medium text-popover-foreground transition-colors hover:bg-accent"
                    >
                        {copy.google}
                    </a>
                </span>
            ) : null}
        </span>
    );
}

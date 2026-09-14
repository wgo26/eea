"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { submitContentReport } from "@/lib/public/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { Dictionary } from "@/lib/i18n";

const REPORT_TYPES = ["spam", "abuse", "misinformation", "other"] as const;

type ReportCopy = Dictionary["report"];

/**
 * In-app content report: reason + optional details, Turnstile-gated,
 * rate-limited server-side. Writes to `reports` (the trust & safety triage
 * queue) — anonymous unless the reporter is signed in. Mounts next to the
 * share row on every content detail page.
 */
export function ReportButton({
    contentItemId,
    copy,
}: {
    contentItemId: string;
    copy: ReportCopy;
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<(typeof REPORT_TYPES)[number]>("spam");
    const [details, setDetails] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const reasonLabel: Record<(typeof REPORT_TYPES)[number], string> = {
        spam: copy.reasonSpam,
        abuse: copy.reasonAbuse,
        misinformation: copy.reasonMisinformation,
        other: copy.reasonOther,
    };

    function reset() {
        setReason("spam");
        setDetails("");
        setError(null);
        setDone(false);
        setLoading(false);
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const formData = new FormData(e.currentTarget);
        const token = formData.get("cf-turnstile-response");
        const result = await submitContentReport({
            contentItemId,
            reportType: reason,
            details: details.trim() || undefined,
            turnstileToken: typeof token === "string" ? token : null,
        });
        setLoading(false);
        if (result.ok) {
            setDone(true);
        } else {
            setError(result.error || copy.error);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    reset();
                    setOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <Flag className="h-4 w-4" aria-hidden />
                {copy.button}
            </button>
            <Dialog
                open={open}
                onOpenChange={(v) => {
                    setOpen(v);
                    if (!v) reset();
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{copy.title}</DialogTitle>
                    </DialogHeader>
                    {done ? (
                        <p className="py-2 text-sm text-muted-foreground">{copy.success}</p>
                    ) : (
                        <form onSubmit={handleSubmit} className="grid gap-4">
                            <p className="text-sm text-muted-foreground">{copy.body}</p>
                            <fieldset className="grid gap-2">
                                <legend className="text-xs font-medium text-muted-foreground">
                                    {copy.reason}
                                </legend>
                                {REPORT_TYPES.map((t) => (
                                    <label
                                        key={t}
                                        className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/5"
                                    >
                                        <input
                                            type="radio"
                                            name="report-type"
                                            value={t}
                                            checked={reason === t}
                                            onChange={() => setReason(t)}
                                            className="h-4 w-4"
                                        />
                                        {reasonLabel[t]}
                                    </label>
                                ))}
                            </fieldset>
                            <label className="grid gap-1.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                    {copy.details}
                                </span>
                                <textarea
                                    value={details}
                                    onChange={(e) => setDetails(e.target.value)}
                                    rows={3}
                                    maxLength={2000}
                                    placeholder={copy.detailsPlaceholder}
                                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </label>
                            <TurnstileWidget />
                            {error ? <p className="text-sm text-destructive">{error}</p> : null}
                            <DialogFooter>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                                    {copy.submit}
                                </button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

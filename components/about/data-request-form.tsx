"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitDataRequest } from "@/lib/public/actions";
import type { SubmitState } from "@/lib/public/types";
import type { Dictionary } from "@/lib/i18n";

export function DataRequestForm({ dict }: { dict: Dictionary }) {
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitDataRequest,
        { ok: false },
    );
    const f = dict.about.dataForm;

    if (state.ok) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
                <p className="mt-3 font-bold">{f.successTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.successBody}</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border bg-card p-5 md:p-6">
            <h2 className="text-base font-extrabold tracking-tight">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            <form action={formAction} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="data-email">{f.email}</Label>
                        <Input
                            id="data-email"
                            name="email"
                            type="email"
                            required
                            placeholder={f.emailPh}
                            autoComplete="email"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="data-type">{f.type}</Label>
                        <select
                            id="data-type"
                            name="type"
                            defaultValue="access"
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        >
                            <option value="access">{f.typeAccess}</option>
                            <option value="deletion">{f.typeDelete}</option>
                            <option value="contact">{f.typeContact}</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="data-details">{f.details}</Label>
                    <Textarea id="data-details" name="details" required placeholder={f.detailsPh} rows={4} />
                </div>
                {state.error ? <p className="text-sm text-destructive">{f.error}</p> : null}
                <Button type="submit" disabled={pending} className="w-full">
                    {pending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            {f.submitting}
                        </>
                    ) : (
                        f.submit
                    )}
                </Button>
            </form>
        </div>
    );
}

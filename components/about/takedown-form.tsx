"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitTakedownReport } from "@/lib/public/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";
import type { Dictionary } from "@/lib/i18n";

export function TakedownForm({ dict }: { dict: Dictionary }) {
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitTakedownReport,
        { ok: false },
    );
    const f = dict.about.takedownForm;

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
                        <Label htmlFor="takedown-name">{f.name}</Label>
                        <Input id="takedown-name" name="name" required placeholder={f.namePh} autoComplete="name" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="takedown-email">{f.email}</Label>
                        <Input
                            id="takedown-email"
                            name="email"
                            type="email"
                            placeholder={f.emailPh}
                            autoComplete="email"
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="takedown-url">{f.contentUrl}</Label>
                    <Input id="takedown-url" name="contentUrl" inputMode="url" placeholder={f.contentUrlPh} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="takedown-basis">{f.basis}</Label>
                    <Textarea id="takedown-basis" name="basis" required placeholder={f.basisPh} rows={3} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="takedown-details">{f.details}</Label>
                    <Textarea id="takedown-details" name="details" placeholder={f.detailsPh} rows={3} />
                </div>
                {state.error ? (
                    <p className="text-sm text-destructive">
                        {state.error === "rate_limited"
                            ? f.errorRateLimited
                            : state.error === "captcha"
                              ? f.errorCaptcha
                              : f.error}
                    </p>
                ) : null}
                {/* Bot trap: hidden from humans; a filled field silently drops the row. */}
                <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="hidden"
                />
                <TurnstileWidget />
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

"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitAdvertiseInquiry } from "@/lib/public/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";
import type { Dictionary } from "@/lib/i18n";

const PLACEMENTS: { value: string; key: keyof Dictionary["advertise"]["placementOptions"] }[] = [
    { value: "homepage", key: "homepage" },
    { value: "rail", key: "rail" },
    { value: "section", key: "section" },
    { value: "newsletter", key: "newsletter" },
    { value: "other", key: "other" },
];

export function AdvertiseForm({ dict }: { dict: Dictionary }) {
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitAdvertiseInquiry,
        { ok: false },
    );
    const f = dict.advertise.fields;

    if (state.ok) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
                <p className="mt-3 font-bold">{dict.advertise.successTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {dict.advertise.successBody}
                </p>
            </div>
        );
    }

    return (
        <form action={formAction} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="company">{f.company}</Label>
                    <Input id="company" name="company" required placeholder={f.companyPlaceholder} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="contactName">{f.contactName}</Label>
                    <Input id="contactName" name="contactName" placeholder={f.contactNamePlaceholder} />
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="email">{f.email}</Label>
                    <Input id="email" name="email" type="email" required placeholder={f.emailPlaceholder} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="phone">{f.phone}</Label>
                    <Input id="phone" name="phone" placeholder={f.phonePlaceholder} />
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="placement">{f.placement}</Label>
                <select
                    id="placement"
                    name="placement"
                    defaultValue=""
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                    <option value="" disabled>
                        {f.placementPlaceholder}
                    </option>
                    {PLACEMENTS.map((p) => (
                        <option key={p.value} value={p.value}>
                            {dict.advertise.placementOptions[p.key]}
                        </option>
                    ))}
                </select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="message">{f.message}</Label>
                <Textarea id="message" name="message" placeholder={f.messagePlaceholder} />
            </div>

            {state.error ? (
                <p className="text-sm text-destructive">
                    {state.error === "rate_limited"
                        ? dict.advertise.errorRateLimited
                        : state.error === "duplicate"
                          ? dict.advertise.errorDuplicate
                          : state.error === "captcha"
                            ? dict.advertise.errorCaptcha
                            : dict.advertise.errorGeneric}
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
                        {dict.advertise.submitting}
                    </>
                ) : (
                    dict.advertise.submit
                )}
            </Button>
        </form>
    );
}

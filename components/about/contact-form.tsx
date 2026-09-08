"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactRequest } from "@/lib/public/actions";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";
import type { Dictionary } from "@/lib/i18n";

const TOPICS = ["tip", "correction", "partnership", "other"] as const;

export function ContactForm({ dict }: { dict: Dictionary }) {
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitContactRequest,
        { ok: false },
    );
    const f = dict.about.contactForm;

    if (state.ok) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
                <p className="mt-3 font-bold">{f.successTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.successBody}</p>
            </div>
        );
    }

    const topicLabel = (t: (typeof TOPICS)[number]) =>
        t === "tip"
            ? f.topicTip
            : t === "correction"
              ? f.topicCorrection
              : t === "partnership"
                ? f.topicPartnership
                : f.topicOther;

    return (
        <form action={formAction} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="contact-name">{f.name}</Label>
                    <Input id="contact-name" name="name" required placeholder={f.namePh} autoComplete="name" />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="contact-email">{f.email}</Label>
                    <Input
                        id="contact-email"
                        name="email"
                        type="email"
                        required
                        placeholder={f.emailPh}
                        autoComplete="email"
                    />
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="contact-topic">{f.topic}</Label>
                <select
                    id="contact-topic"
                    name="topic"
                    defaultValue="tip"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                    {TOPICS.map((t) => (
                        <option key={t} value={t}>
                            {topicLabel(t)}
                        </option>
                    ))}
                </select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="contact-message">{f.message}</Label>
                <Textarea id="contact-message" name="message" required placeholder={f.messagePh} rows={5} />
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
    );
}

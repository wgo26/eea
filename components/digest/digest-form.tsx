"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { subscribeDigest, unsubscribeDigest } from "@/lib/notify/actions";
import type { Dictionary, Locale } from "@/lib/i18n";

type State = { ok: true } | { ok: false; error: string };

/** Public daily-digest opt-in + opt-out (gap B). Dictionary-driven, no hardcoded copy. */
export function DigestForm({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.digest;
  const [state, formAction, pending] = useActionState<State, FormData>(
    subscribeDigest,
    { ok: false, error: '' },
  );
  const [unsubState, unsubAction, unsubPending] = useActionState<State, FormData>(
    unsubscribeDigest,
    { ok: false, error: '' },
  );

  if (state.ok) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
        <p className="mt-3 font-bold">{t.successTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.successBody}</p>
      </div>
    );
  }

  const errorText =
    state.error === "rate_limited"
      ? t.errorRateLimited
      : state.error === "captcha"
        ? t.errorCaptcha
        : state.error === "invalid"
          ? t.errorInvalid
          : state.error
            ? t.errorGeneric
            : null;

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="digest-email">{t.email}</Label>
            <Input id="digest-email" name="email" type="email" placeholder={t.emailPlaceholder} autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="digest-whatsapp">{t.whatsapp}</Label>
            <Input id="digest-whatsapp" name="whatsapp" type="tel" placeholder={t.whatsappPlaceholder} autoComplete="tel" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="digest-locale">{t.locale}</Label>
          <select
            id="digest-locale"
            name="locale"
            defaultValue={locale}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="en">{t.localeEn}</option>
            <option value="fr">{t.localeFr}</option>
          </select>
        </div>
        {errorText ? <p className="text-sm text-destructive">{errorText}</p> : null}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <TurnstileWidget />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t.submitting}
            </>
          ) : (
            t.submit
          )}
        </Button>
        <p className="text-xs text-muted-foreground">{t.privacyNote}</p>
      </form>

      <form action={unsubAction} className="space-y-3 rounded-2xl border border-dashed p-6">
        <p className="font-bold">{t.unsubscribeTitle}</p>
        <p className="text-sm text-muted-foreground">{t.unsubscribeBody}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input name="email" type="email" required placeholder={t.emailPlaceholder} aria-label={t.email} className="flex-1" />
          <Button type="submit" variant="outline" disabled={unsubPending}>
            {t.unsubscribeSubmit}
          </Button>
        </div>
        {unsubState.ok ? (
          <p className="text-sm font-medium text-emerald-600">{t.unsubscribed}</p>
        ) : unsubState.error ? (
          <p className="text-sm text-destructive">
            {unsubState.error === "rate_limited" ? t.errorRateLimited : t.errorGeneric}
          </p>
        ) : null}
      </form>
    </div>
  );
}

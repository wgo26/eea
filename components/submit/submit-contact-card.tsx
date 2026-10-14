"use client";

import { AlertCircle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n";
import { Field } from "./submit-field";
import type { SubmitInitial } from "./submit-types";

type Fields = Dictionary["submit"]["fields"];
type Steps = Dictionary["submit"]["steps"];

/**
 * Contact card — collapsed to a profile line for signed-in contributors,
 * full name/email/phone fields otherwise. Always visible (never inside a
 * hidden step) so its `required` fields validate on every step advance.
 */
export function SubmitContactCard(props: {
    initial?: SubmitInitial;
    showContact: boolean;
    setShowContact: (show: boolean) => void;
    contactError: boolean;
    isBuySell: boolean;
    f: Fields;
    s: Steps;
    errorRequired: string;
}) {
    const { initial, showContact, setShowContact, contactError, isBuySell, f, s, errorRequired } = props;

    return (
        <div id="submit-contact" className="rounded-2xl border bg-muted/30 p-4">
        {initial?.name && !showContact ? (
            <div className="flex items-center justify-between gap-3 text-sm">
                <p className="inline-flex items-center gap-2">
                    {initial.email ? (
                        <Check className="h-4 w-4 text-emerald-500" aria-hidden />
                    ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden />
                    )}
                    <span>
                        {s.submittingAs}{" "}
                        <strong>{initial.name}</strong>
                        {initial.email ? ` · ${initial.email}` : ""}
                    </span>
                </p>
                <button
                    type="button"
                    onClick={() => setShowContact(true)}
                    className="shrink-0 font-medium text-primary hover:underline"
                >
                    {s.change}
                </button>
            </div>
        ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold">{s.contact}</p>
                        {initial?.name ? (
                            <button
                                type="button"
                                onClick={() => setShowContact(false)}
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                {s.useProfile}
                            </button>
                        ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={f.contributorName} htmlFor="contributorName">
                            <Input
                                id="contributorName"
                                name="contributorName"
                                defaultValue={initial?.name ?? ""}
                                required={!initial?.name}
                                placeholder={f.contributorNamePlaceholder}
                            />
                        </Field>
                        <Field label={f.email} htmlFor="email">
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                defaultValue={initial?.email ?? ""}
                                placeholder={f.emailPlaceholder}
                            />
                        </Field>
                    </div>
                    <Field label={f.phone} htmlFor="phone" hint={isBuySell ? f.buySellContactHint : undefined}>
                        <Input
                            id="phone"
                            name="phone"
                            defaultValue={initial?.phone ?? ""}
                            placeholder={f.phonePlaceholder}
                        />
                    </Field>
                    {contactError ? (
                        <p role="alert" className="text-sm text-destructive">
                            {errorRequired}
                        </p>
                    ) : null}
                </div>
            )}
            {initial?.name && !showContact ? (
                <>
                    <input type="hidden" name="contributorName" value={initial.name} />
                    <input type="hidden" name="email" value={initial.email ?? ""} />
                    <input type="hidden" name="phone" value={initial.phone ?? ""} />
                </>
            ) : null}
        </div>
    );
}

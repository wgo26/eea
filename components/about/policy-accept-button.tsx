"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { recordPolicyAcceptance } from "@/lib/public/actions";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";

/**
 * Acceptance trail for signed-in users. Guests are covered by the consent
 * checkboxes stored on their submissions row; this button writes the
 * policy_acceptances row that guests cannot have (no user_id).
 */
export function PolicyAcceptButton({
    policyVersionId,
    locale,
}: {
    policyVersionId: string;
    locale: Locale;
}) {
    const dict = getDictionary(locale);
    const [status, setStatus] = useState<"idle" | "saving" | "done" | "signin">("idle");

    async function handleAccept() {
        setStatus("saving");
        const result = await recordPolicyAcceptance(policyVersionId);
        if (result.ok) setStatus("done");
        else if (result.error === "auth") setStatus("signin");
        else setStatus("idle");
    }

    if (status === "done") {
        return (
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {dict.about.accepted}
            </p>
        );
    }

    return (
        <div className="flex flex-col items-start gap-2">
            <Button type="button" variant="outline" onClick={handleAccept} disabled={status === "saving"}>
                {status === "saving" ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        …
                    </>
                ) : (
                    dict.about.accept
                )}
            </Button>
            {status === "signin" ? (
                <p className="text-xs text-muted-foreground">{dict.about.signInToAccept}</p>
            ) : null}
        </div>
    );
}

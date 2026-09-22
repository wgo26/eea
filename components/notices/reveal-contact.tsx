"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { revealNoticeContact } from "@/lib/public/actions";

type RevealNoticeContactProps = {
    noticeId: string;
    organizationName: string | null;
    hasContact: boolean;
    isExpired: boolean;
    labels: {
        reveal: string;
        hide: string;
        phone: string;
        email: string;
        contactViaOrganization: string;
        rateLimited: string;
        unavailable: string;
        loading: string;
        expiredNotice: string;
        safetyHint: string;
    };
};

/**
 * Phase 0 — gated notice-contact block (parity with Buy & Sell).
 * Phone/email are fetched on demand via a rate-limited Server Action so they
 * never appear in SSR HTML or crawler indexes. Column REVOKEs in migration
 * 20260921120000 are the backstop.
 */
export function RevealNoticeContact({
    noticeId,
    organizationName,
    hasContact,
    isExpired,
    labels,
}: RevealNoticeContactProps) {
    const [revealed, setRevealed] = React.useState(false);
    const [isPending, startTransition] = React.useTransition();
    const [contact, setContact] = React.useState<{
        phone: string | null;
        email: string | null;
    } | null>(null);
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    if (isExpired) {
        return (
            <p className="text-sm text-muted-foreground">{labels.expiredNotice}</p>
        );
    }

    if (!hasContact) {
        return (
            <div className="space-y-2">
                {organizationName ? (
                    <p className="text-sm font-medium">{organizationName}</p>
                ) : null}
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {labels.contactViaOrganization}
                </p>
            </div>
        );
    }

    const handleReveal = () => {
        if (contact) {
            setRevealed(true);
            return;
        }

        setErrorMessage(null);
        startTransition(async () => {
            const res = await revealNoticeContact(noticeId);
            if (res.ok) {
                setContact(res.contact);
                setRevealed(true);
            } else if (res.error === "rate_limited") {
                setErrorMessage(labels.rateLimited);
            } else {
                setErrorMessage(labels.unavailable);
            }
        });
    };

    return (
        <div className="space-y-3">
            {organizationName ? (
                <p className="text-sm font-medium">{organizationName}</p>
            ) : null}
            {!revealed ? (
                <div>
                    <Button
                        type="button"
                        variant="default"
                        className="w-full"
                        disabled={isPending}
                        onClick={handleReveal}
                    >
                        {isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                <span>{labels.loading}</span>
                            </>
                        ) : (
                            <>
                                <Eye className="h-4 w-4" aria-hidden />
                                <span>{labels.reveal}</span>
                            </>
                        )}
                    </Button>
                    {errorMessage ? (
                        <p className="mt-2 text-xs text-destructive">{errorMessage}</p>
                    ) : null}
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {labels.safetyHint}
                    </p>
                </div>
            ) : (
                <>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setRevealed(false)}
                    >
                        <EyeOff className="h-4 w-4" aria-hidden />
                        {labels.hide}
                    </Button>
                    <ul className="space-y-2 text-sm">
                        {contact?.phone ? (
                            <li>
                                <a
                                    href={`tel:${contact.phone}`}
                                    className="inline-flex items-center gap-2 font-medium hover:underline"
                                >
                                    <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {contact.phone}
                                </a>
                            </li>
                        ) : null}
                        {contact?.email ? (
                            <li>
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="inline-flex items-center gap-2 font-medium hover:underline"
                                >
                                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {contact.email}
                                </a>
                            </li>
                        ) : null}
                    </ul>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {labels.safetyHint}
                    </p>
                </>
            )}
        </div>
    );
}

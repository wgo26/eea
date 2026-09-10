"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2, Mail, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/lib/format";
import { revealSellerContact } from "@/lib/public/actions";

type RevealContactProps = {
    listingId: string;
    sellerName: string | null;
    hasPhone: boolean;
    hasEmail: boolean;
    hasWhatsapp: boolean;
    isActive: boolean;
    title: string;
    labels: {
        reveal: string;
        hide: string;
        phone: string;
        email: string;
        whatsapp: string;
        contactSeller: string;
        rateLimited: string;
        unavailable: string;
        loading: string;
        soldNotice: string;
    };
};

/**
 * Gated seller-contact block for the Buy & Sell detail page.
 * Contact details are retrieved asynchronously via a rate-limited Server Action
 * so they are never leaked into the server-rendered HTML or crawler index.
 */
export function RevealContact({
    listingId,
    sellerName,
    hasPhone,
    hasEmail,
    hasWhatsapp,
    isActive,
    title,
    labels,
}: RevealContactProps) {
    const [revealed, setRevealed] = React.useState(false);
    const [isPending, startTransition] = React.useTransition();
    const [contact, setContact] = React.useState<{
        phone: string | null;
        email: string | null;
        whatsapp: string | null;
    } | null>(null);
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const hasAnyContact = hasPhone || hasEmail || hasWhatsapp;

    if (!isActive) {
        return (
            <p className="text-sm text-muted-foreground">
                {labels.soldNotice}
            </p>
        );
    }

    if (!hasAnyContact) {
        return (
            <p className="text-sm text-muted-foreground">
                {labels.contactSeller}
            </p>
        );
    }

    const handleReveal = () => {
        if (contact) {
            setRevealed(true);
            return;
        }

        setErrorMessage(null);
        startTransition(async () => {
            const res = await revealSellerContact(listingId);
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
                        {contact?.whatsapp ? (
                            <li>
                                <a
                                    href={whatsappHref(
                                        contact.whatsapp,
                                        `Hello, I'm interested in: ${title}`,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                                >
                                    <MessageCircle className="h-4 w-4" aria-hidden />
                                    {labels.whatsapp}
                                </a>
                            </li>
                        ) : null}
                    </ul>
                    {sellerName ? (
                        <p className="text-xs text-muted-foreground">
                            {labels.contactSeller}: {sellerName}
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );
}


"use client";

import * as React from "react";
import { Eye, EyeOff, Mail, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { whatsappHref } from "@/lib/format";

type RevealContactProps = {
    sellerName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    whatsappNumber: string | null;
    title: string;
    labels: {
        reveal: string;
        hide: string;
        phone: string;
        email: string;
        whatsapp: string;
        contactSeller: string;
    };
};

/**
 * Gated seller-contact block for the Buy & Sell detail page. The contact
 * details are always in the DOM (server-rendered) but visually hidden until
 * the visitor explicitly reveals them — a light-touch anti-scrape affordance.
 */
export function RevealContact({
    sellerName,
    contactPhone,
    contactEmail,
    whatsappNumber,
    title,
    labels,
}: RevealContactProps) {
    const [revealed, setRevealed] = React.useState(false);
    const hasContact = Boolean(contactPhone || contactEmail || whatsappNumber);

    if (!hasContact) {
        return (
            <p className="text-sm text-muted-foreground">
                {labels.contactSeller}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {!revealed ? (
                <Button
                    type="button"
                    variant="default"
                    className="w-full"
                    onClick={() => setRevealed(true)}
                >
                    <Eye className="h-4 w-4" aria-hidden />
                    {labels.reveal}
                </Button>
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
                        {contactPhone ? (
                            <li>
                                <a
                                    href={`tel:${contactPhone}`}
                                    className="inline-flex items-center gap-2 font-medium hover:underline"
                                >
                                    <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {contactPhone}
                                </a>
                            </li>
                        ) : null}
                        {contactEmail ? (
                            <li>
                                <a
                                    href={`mailto:${contactEmail}`}
                                    className="inline-flex items-center gap-2 font-medium hover:underline"
                                >
                                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    {contactEmail}
                                </a>
                            </li>
                        ) : null}
                        {whatsappNumber ? (
                            <li>
                                <a
                                    href={whatsappHref(
                                        whatsappNumber,
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

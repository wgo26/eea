"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ShareButtonsProps = {
    url: string;
    title: string;
    /** Optional Pidgin/Camfranglais share text variant (tone overlay, not a locale). */
    shareText?: string;
    /** Localized labels — passed by localized pages (defaults keep English). */
    labels?: {
        share: string;
        whatsapp: string;
        copyLink: string;
        copied: string;
    };
};

const DEFAULT_LABELS = {
    share: "Share",
    whatsapp: "WhatsApp",
    copyLink: "Copy link",
    copied: "Copied!",
};

export function ShareButtons({ url, title, shareText, labels }: ShareButtonsProps) {
    const text = shareText ?? title;
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);
    const t = { ...DEFAULT_LABELS, ...labels };
    const [copied, setCopied] = useState(false);

    async function shareNative() {
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({ title, text, url });
            } catch {
                // user dismissed
            }
        } else {
            window.open(
                `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
                "_blank"
            );
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            // Clipboard API unavailable (permissions/insecure context) —
            // fall back to a selection-based copy.
            const ta = document.createElement("textarea");
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={shareNative}>
                {t.share}
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() =>
                    window.open(
                        `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
                        "_blank"
                    )
                }
            >
                {t.whatsapp}
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                aria-label={t.copyLink}
                title={t.copyLink}
            >
                {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                    <Link2 className="h-4 w-4" aria-hidden />
                )}
                {copied ? t.copied : t.copyLink}
            </Button>
        </div>
    );
}

"use client";

import { useState } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, Send, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Rich share row for the article page: native share (mobile) + copy-link
 * with confirmation + WhatsApp / Facebook / X / e-mail deep links. All
 * targets are share-service URLs or the article URL — no bare internal
 * hrefs, so the bare-href audit stays clean.
 */
export function ArticleShare({
    url,
    title,
    copyLabel,
    copiedLabel,
    shareLabel,
    whatsappLabel,
    facebookLabel,
    xLabel,
    emailLabel,
}: {
    url: string;
    title: string;
    copyLabel: string;
    copiedLabel: string;
    shareLabel: string;
    whatsappLabel: string;
    facebookLabel: string;
    xLabel: string;
    emailLabel: string;
}) {
    const [copied, setCopied] = useState(false);
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
    }

    async function shareNative() {
        if (typeof navigator !== "undefined" && "share" in navigator) {
            try {
                await (navigator as Navigator & { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({
                    title,
                    text: title,
                    url,
                });
                return;
            } catch {
                /* user dismissed — fall through to copy */
            }
        }
        copyLink();
    }

    const open = (target: string) => window.open(target, "_blank", "noopener,noreferrer");

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={shareNative} className="gap-1.5">
                <Share2 className="h-4 w-4" aria-hidden />
                {shareLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={copyLink} aria-live="polite" className="gap-1.5">
                {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? copiedLabel : copyLabel}
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => open(`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`)}
                aria-label={whatsappLabel}
                className="gap-1.5"
            >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}
                aria-label={facebookLabel}
                className="gap-1.5"
            >
                <Send className="h-4 w-4" aria-hidden />
                Facebook
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => open(`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`)}
                aria-label={xLabel}
            >
                𝕏
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() =>
                    (window.location.href = `mailto:?subject=${encodedTitle}&body=${encodedUrl}`)
                }
                aria-label={emailLabel}
            >
                <Mail className="h-4 w-4" aria-hidden />
            </Button>
            <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:inline-flex">
                <Link2 className="h-3 w-3" aria-hidden />
                {url.replace(/^https?:\/\//, "").slice(0, 48)}
            </span>
        </div>
    );
}

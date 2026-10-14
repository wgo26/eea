import { ShareSheet } from "@/components/system/share-sheet";
import type { ShareContentType } from "@/lib/share/pidgin";

/**
 * Rich share row for the article page — thin wrapper over the shared
 * ShareSheet (WhatsApp-first, native share, copy-link, more options).
 * Keeps the existing prop contract so all callers get the new UX free.
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
    /**
     * Phase 4 — Pidgin/Camfranglais share line (Differentiators #8/#9).
     * When the editor wrote one, WhatsApp + native share lead with it
     * instead of the formal title.
     */
    shareText,
    /**
     * W21 — voice register of the share line (formal/pidgin/camfranglais)
     * for aggregate share-voice measurement. Optional: unknown renders as
     * formal in the beacon.
     */
    voiceType,
    locale,
    /** Per-content id — taps bump `share_count` + voice aggregate. */
    contentId,
    contentType,
    moreOptionsLabel,
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
    shareText?: string | null;
    voiceType?: string | null;
    locale?: string;
    contentId?: string | null;
    /** Content type for the Pidgin fallback line (shareText wins). */
    contentType?: ShareContentType | null;
    moreOptionsLabel?: string;
}) {
    return (
        <ShareSheet
            url={url}
            title={title}
            shareText={shareText}
            voiceType={voiceType}
            locale={locale}
            contentId={contentId}
            contentType={contentType}
            labels={{
                share: shareLabel,
                whatsapp: whatsappLabel,
                copyLink: copyLabel,
                copied: copiedLabel,
                facebook: facebookLabel,
                x: xLabel,
                email: emailLabel,
                moreOptions: moreOptionsLabel ?? (locale === "fr" ? "Plus" : "More"),
            }}
        />
    );
}

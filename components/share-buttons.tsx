import { ShareSheet } from "@/components/system/share-sheet";
import type { ShareContentType } from "@/lib/share/pidgin";

type ShareButtonsProps = {
    url: string;
    title: string;
    /** Optional Pidgin/Camfranglais share text variant (tone overlay, not a locale). */
    shareText?: string;
    voiceType?: string | null;
    locale?: string;
    /** Per-content id — taps bump `share_count` + voice aggregate. */
    contentId?: string | null;
    /** Content type for the Pidgin fallback line (shareText wins). */
    contentType?: ShareContentType | null;
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

export function ShareButtons({ url, title, shareText, voiceType, locale, contentId, contentType, labels }: ShareButtonsProps) {
    const t = { ...DEFAULT_LABELS, ...labels };
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
                ...t,
                facebook: "Facebook",
                x: "X",
                email: "E-mail",
                moreOptions: locale === "fr" ? "Plus" : "More",
            }}
        />
    );
}

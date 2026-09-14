"use client";

import { ShareButtons } from "@/components/share-buttons";
import { SaveButton } from "@/components/system/save-button";
import { ReportButton } from "@/components/system/report-dialog";
import { TextSizeControl } from "@/components/system/text-size-control";
import { ReadingModeToggle } from "@/components/system/reading-mode-toggle";
import { ListenButton } from "@/components/system/listen-button";
import { QrShareButton } from "@/components/system/qr-share-button";
import { useExperiment } from "@/lib/experiments";
import type { Dictionary, Locale } from "@/lib/i18n";

/**
 * Standard action row under article content: share (incl. copy-link),
 * save-for-later, report, listen, QR, text-size and reading-mode controls.
 * Hidden in print — interactive chrome has no business on paper.
 *
 * The running `action-row-order` experiment swaps share-first (control)
 * against save-first; assignment is sticky per browser.
 */
export function ArticleActionRow({
    contentItemId,
    shareUrl,
    title,
    locale,
    listenText,
    saveVariant = "bookmark",
    showTextSize = true,
    showReadingMode = true,
    showListen = true,
    showQr = true,
    dict,
}: {
    contentItemId: string;
    shareUrl: string;
    title: string;
    locale: Locale;
    /** Plain-ish text for audio playback (tags are stripped defensively). */
    listenText?: string | null;
    saveVariant?: "bookmark" | "heart";
    showTextSize?: boolean;
    showReadingMode?: boolean;
    showListen?: boolean;
    showQr?: boolean;
    dict: Dictionary;
}) {
    const order = useExperiment("action-row-order");
    const shareLabels = {
        share: dict.common.share,
        whatsapp: dict.common.whatsapp,
        copyLink: dict.common.copyLink,
        copied: dict.common.copied,
    };
    const saveLabels = {
        save: dict.common.saveForLater,
        unsave: dict.common.removeSaved,
        savedMessage: dict.common.savedToList,
        removedMessage: dict.common.removedFromList,
        signIn: dict.common.signInToSave,
    };

    const share = <ShareButtons url={shareUrl} title={title} labels={shareLabels} />;
    const save = <SaveButton contentItemId={contentItemId} variant={saveVariant} labels={saveLabels} />;

    return (
        <div className="no-print flex flex-wrap items-center gap-2">
            {order === "save-first" ? (
                <>
                    {save}
                    {share}
                </>
            ) : (
                <>
                    {share}
                    {save}
                </>
            )}
            <ReportButton contentItemId={contentItemId} copy={dict.report} />
            {showListen && listenText ? (
                <ListenButton title={title} text={listenText} locale={locale} copy={dict.listen} />
            ) : null}
            {showQr ? <QrShareButton url={shareUrl} copy={dict.qr} /> : null}
            {showTextSize ? <TextSizeControl copy={dict.textSize} /> : null}
            {showReadingMode ? <ReadingModeToggle copy={dict.readingMode} /> : null}
        </div>
    );
}

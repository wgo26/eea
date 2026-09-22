"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { startConversation } from "@/lib/messages/actions";
import { localePath } from "@/lib/i18n/urls";
import type { Locale } from "@/lib/i18n";

type MessagesCopy = {
    startConversation: string;
    signIn: string;
    error: string;
};

/**
 * "Message seller" entry point on listing pages: opens (or reuses) the
 * buyer↔seller conversation, then jumps to the account inbox thread.
 */
export function MessageSellerButton({
    contentItemId,
    locale,
    copy,
}: {
    contentItemId: string;
    locale: Locale;
    copy: MessagesCopy;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    async function handleClick() {
        if (busy) return;
        setBusy(true);
        const result = await startConversation(contentItemId);
        setBusy(false);
        if (!result.ok) {
            setNotice(result.error === "Not authenticated." ? copy.signIn : result.error || copy.error);
            return;
        }
        router.push(localePath(locale, `/account/messages/${result.conversationId}`));
    }

    return (
        <span className="inline-flex flex-col gap-1">
            <button
                type="button"
                onClick={handleClick}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                {copy.startConversation}
            </button>
            {notice ? (
                <span role="status" className="text-xs text-muted-foreground">
                    {notice}
                </span>
            ) : null}
        </span>
    );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Send } from "lucide-react";
import { sendMessage, blockUser, unblockUser, type ThreadDetail } from "@/lib/messages/actions";
import { ReportButton } from "@/components/system/report-dialog";
import { localePath } from "@/lib/i18n/urls";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MessagesCopy = Dictionary["account"]["messages"];

/**
 * Conversation thread: chronological bubbles + send box. Server-rendered
 * history, client-side send with optimistic append (rolled back on error).
 */
export function ThreadClient({
    thread,
    dict,
    locale,
}: {
    thread: ThreadDetail;
    dict: Dictionary;
    locale: Locale;
}) {
    const t = dict.account.messages as MessagesCopy;
    const router = useRouter();
    const [messages, setMessages] = useState(thread.messages);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // W14 safety controls: report + unilateral block, both from the thread.
    const [blocked, setBlocked] = useState(thread.blockedByMe);
    const [blockBusy, setBlockBusy] = useState(false);

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        const text = draft.trim();
        if (!text || busy) return;
        setBusy(true);
        setError(null);
        const optimistic = { id: `pending-${Date.now()}`, senderId: "", mine: true, body: text, createdAt: new Date().toISOString() };
        setMessages((prev) => [...prev, optimistic]);
        setDraft("");
        const result = await sendMessage(thread.id, text);
        setBusy(false);
        if (!result.ok) {
            setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
            setDraft(text);
            setError(t.error);
        }
    }

    async function handleBlock() {
        if (blockBusy) return;
        if (!window.confirm(t.blockConfirm)) return;
        setBlockBusy(true);
        setError(null);
        const result = await blockUser(thread.otherUserId);
        setBlockBusy(false);
        if (result.ok) {
            // The thread leaves the blocker's inbox — land them back there.
            router.push(localePath(locale, "/account/messages"));
        } else {
            setError(t.blockError);
        }
    }

    async function handleUnblock() {
        if (blockBusy) return;
        setBlockBusy(true);
        setError(null);
        const result = await unblockUser(thread.otherUserId);
        setBlockBusy(false);
        if (result.ok) {
            setBlocked(false);
            router.refresh();
        } else {
            setError(t.blockError);
        }
    }

    return (
        <div className="space-y-4">
            <Link
                href={localePath(locale, "/account/messages")}
                className="inline-flex text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
                ← {t.backToInbox}
            </Link>
            <div className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-bold">{thread.listingTitle}</p>
                        {thread.otherName ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{thread.otherName}</p>
                        ) : null}
                        {blocked ? null : (
                            <p className="mt-1 text-xs text-muted-foreground">{t.expectation}</p>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <ReportButton contentItemId={thread.contentItemId} copy={dict.report} />
                        {blocked ? (
                            <button
                                type="button"
                                onClick={handleUnblock}
                                disabled={blockBusy}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                            >
                                {t.unblock}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleBlock}
                                disabled={blockBusy}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                            >
                                <Ban className="h-4 w-4" aria-hidden />
                                {t.block}
                            </button>
                        )}
                    </div>
                </div>
                {blocked ? (
                    <p
                        role="status"
                        className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
                    >
                        {t.blockedNotice}
                    </p>
                ) : null}
            </div>
            <ul className="space-y-2">
                {messages.map((m) => (
                    <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                        <p
                            className={cn(
                                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                                m.mine ? "bg-primary text-primary-foreground" : "border border-border bg-card",
                            )}
                        >
                            {m.body}
                        </p>
                    </li>
                ))}
            </ul>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {blocked ? null : (
            <form onSubmit={handleSend} className="flex gap-2">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t.placeholder}
                    maxLength={2000}
                    aria-label={t.placeholder}
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                    <Send className="h-4 w-4" aria-hidden />
                    {t.send}
                </button>
            </form>
            )}
        </div>
    );
}

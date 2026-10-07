"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { getChatMessages, postChatMessage, reportChatMessage, setChatHidden } from "@/lib/live/actions";

type Message = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  isHidden: boolean;
};

export type LiveChatCopy = {
  title: string;
  hint: string;
  placeholder: string;
  send: string;
  signIn: string;
  closed: string;
  empty: string;
  hiddenNote: string;
  report: string;
  reported: string;
};

const POLL_MS = 10_000;

/**
 * Live event chat: polls while the broadcast is live, 10s slow-mode + 500-char
 * cap enforced server-side, moderator hide behind `moderate`. Guests read;
 * only signed-in viewers post.
 */
export function LiveChat({
  broadcastId,
  contentItemId,
  isLive,
  signedIn,
  canModerate,
  copy,
}: {
  broadcastId: string;
  contentItemId: string;
  isLive: boolean;
  signedIn: boolean;
  canModerate: boolean;
  copy: LiveChatCopy;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initial load + 10s poll while live. State lands in `.then`
  // continuations (never synchronously in the effect body) — the same
  // pattern as the event ReminderButton, which the hooks lint accepts.
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const load = () => {
      void getChatMessages(broadcastId).then((rows) => {
        if (!cancelled) setMessages(rows);
      });
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isLive, broadcastId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    if (busy || !draft.trim()) return;
    setBusy(true);
    const res = await postChatMessage({ broadcastId, contentItemId, body: draft });
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setDraft("");
    setNotice(null);
    setMessages((m) => [...m, { ...res.message, isHidden: false }]);
  }

  async function report(id: string) {
    const result = await reportChatMessage({ messageId: id, contentItemId });
    setNotice(result.ok ? copy.reported : result.error);
  }

  async function hide(id: string, hidden: boolean) {
    const result = await setChatHidden({ messageId: id, hidden, contentItemId, slugOrId: contentItemId });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, isHidden: hidden } : msg)));
  }

  if (!isLive) {
    return <p className="text-xs text-muted-foreground">{copy.closed}</p>;
  }

  return (
    <section aria-label={copy.title} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-extrabold">
        <MessageCircle className="h-4 w-4" aria-hidden />
        {copy.title}
      </h3>
      <p className="text-[11px] text-muted-foreground">{copy.hint}</p>
      <div className="flex max-h-72 min-h-32 flex-col gap-1.5 overflow-y-auto rounded-xl bg-muted/40 p-2.5" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{copy.empty}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="group flex items-start justify-between gap-2 text-sm">
              <p className={m.isHidden ? "text-muted-foreground/60 italic" : ""}>
                <span className="mr-1.5 font-semibold">{m.authorName ?? "···"}</span>
                <span>{m.isHidden ? copy.hiddenNote : m.body}</span>
              </p>
              {!m.isHidden ? (
                <button
                  type="button"
                  onClick={() => void report(m.id)}
                  title={copy.report}
                  aria-label={copy.report}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  ⚑
                </button>
              ) : null}
              {canModerate && !m.isHidden ? (
                <button
                  type="button"
                  onClick={() => void hide(m.id, true)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  ×
                </button>
              ) : null}
              {canModerate && m.isHidden ? (
                <button
                  type="button"
                  onClick={() => void hide(m.id, false)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  ↩
                </button>
              ) : null}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      {signedIn ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="h-10 min-h-[44px] flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {copy.send}
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{copy.signIn}</p>
      )}
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";

export type AiPanelCopy = {
  title: string;
  hint: string;
  improve: string;
  complete: string;
  tone: string;
  seo: string;
  readability: string;
  headline: string;
  summary: string;
  tags: string;
  modalTitle: string;
  modalPlaceholder: string;
  cancel: string;
  generate: string;
  working: string;
};

type Props = {
  copy: AiPanelCopy;
  disabled?: boolean;
  working?: boolean;
  onAction: (kind: "improve" | "complete" | "tone" | "seo" | "readability" | "headline" | "summary" | "tags", instruction: string) => void;
  lastResult?: string | null;
};

/**
 * AI rail for the Story section: eight selection-aware actions behind one
 * modal (instruction + generate), mirroring the field-level assist pattern —
 * AI writes into the FORM for review, never straight to a published row.
 */
export function AiPanel({ copy, disabled, working, onAction, lastResult }: Props) {
  const [open, setOpen] = useState<null | { kind: Parameters<Props["onAction"]>[0]; title: string }>(null);
  const [instruction, setInstruction] = useState("");

  const cards = [
    { kind: "improve", label: copy.improve, desc: copy.hint },
    { kind: "complete", label: copy.complete, desc: copy.hint },
    { kind: "tone", label: copy.tone, desc: copy.hint },
    { kind: "seo", label: copy.seo, desc: copy.hint },
    { kind: "readability", label: copy.readability, desc: copy.hint },
    { kind: "headline", label: copy.headline, desc: copy.hint },
    { kind: "summary", label: copy.summary, desc: copy.hint },
    { kind: "tags", label: copy.tags, desc: copy.hint },
  ] as const;

  const cardCls =
    "rounded-xl border border-border bg-background p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md disabled:opacity-50 min-h-[44px]";

  return (
    <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.title}</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((c) => (
          <button
            key={c.kind}
            type="button"
            disabled={disabled || working}
            className={cardCls}
            onClick={() => {
              setInstruction("");
              setOpen({ kind: c.kind, title: c.label });
            }}
          >
            <span className="block text-xs font-semibold text-foreground">{c.label}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{c.desc}</span>
          </button>
        ))}
      </div>
      {lastResult ? (
        <p className="rounded-md border border-border bg-background p-2 text-xs text-muted-foreground" role="status">
          {lastResult}
        </p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal
          aria-label={open.title}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {copy.modalTitle}: {open.title}
            </h2>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              placeholder={copy.modalPlaceholder}
              className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
                onClick={() => setOpen(null)}
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={working}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-[44px]"
                onClick={() => {
                  onAction(open.kind, instruction);
                  setOpen(null);
                }}
              >
                {working ? copy.working : copy.generate}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

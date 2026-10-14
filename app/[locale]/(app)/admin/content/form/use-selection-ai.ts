"use client";

import { useState } from "react";
import { aiSelectionAssist } from "@/lib/admin/actions/ai";
import { replaceSelectionHtml } from "@/lib/content/selection";
import type { Dictionary } from "@/lib/i18n";
import type { FormValues } from "./values";

type Copy = Dictionary["admin"]["content"];
type AddToast = (msg: string, type?: "success" | "error" | "info") => void;

export type SelectionAiKind =
  | "improve"
  | "complete"
  | "tone"
  | "seo"
  | "readability"
  | "headline"
  | "summary"
  | "tags";

/**
 * Selection-aware AI rail state (the Story section's AiPanel). Reads the
 * window selection (or falls back to the EN/FR body), routes the result to
 * the title / excerpt / tags / body, and reports provenance. Extracted from
 * content-form.tsx verbatim — the Story section is its only consumer.
 */
export function useSelectionAi(opts: {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  copy: Copy;
  addToast: AddToast;
}) {
  const { values: v, patch, copy, addToast } = opts;
  const [aiWorking, setAiWorking] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  async function handleSelectionAi(kind: SelectionAiKind, instruction: string) {
    if (aiWorking) return;
    const sel = typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "") : "";
    const selText = sel.trim().slice(0, 8000);
    const fallbackBody = v.enBody || v.frBody;
    const sourceText = selText || fallbackBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!sourceText || sourceText.length < 3) {
      addToast(copy.aiSelectionEmpty, "error");
      return;
    }
    setAiWorking(true);
    try {
      const res = await aiSelectionAssist({ kind, text: sourceText, instruction });
      if (!res.ok || !("html" in res) || !res.html) {
        addToast(res.ok ? copy.translateEmpty : res.error, "error");
        return;
      }
      const html = res.html;
      const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      // Locale target: the body holding the selection wins, else EN, else FR.
      const target: "en" | "fr" = selText
        ? v.enBody.includes(selText.slice(0, 60))
          ? "en"
          : v.frBody.includes(selText.slice(0, 60))
            ? "fr"
            : v.enBody
              ? "en"
              : "fr"
        : v.enBody
          ? "en"
          : "fr";
      if (kind === "headline") {
        const first = plain.split("\n")[0]?.slice(0, 300) ?? plain.slice(0, 300);
        patch(target === "en" ? { enTitle: first } : { frTitle: first });
      } else if (kind === "summary") {
        patch(target === "en" ? { enExcerpt: plain.slice(0, 2000) } : { frExcerpt: plain.slice(0, 2000) });
      } else if (kind === "tags") {
        const existing = v.tags.split(",").map((t) => t.trim()).filter(Boolean);
        const fresh = plain.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5);
        patch({ tags: [...existing, ...fresh.filter((t) => !existing.map((e) => e.toLowerCase()).includes(t.toLowerCase()))].join(", ") });
      } else if (kind === "complete" || !selText) {
        patch(target === "en" ? { enBody: `${v.enBody}\n${html}` } : { frBody: `${v.frBody}\n${html}` });
      } else {
        // In-place rewrite: swap the selected slice, fall back to append.
        const body = target === "en" ? v.enBody : v.frBody;
        const next = replaceSelectionHtml(body, selText, html);
        const applied = next !== body ? next : `${body}\n${html}`;
        patch(target === "en" ? { enBody: applied } : { frBody: applied });
      }
      setAiResult(`${copy.aiModalTitle} · ${kind} — ${copy.aiSelectionApplied}`);
      addToast(copy.aiSelectionApplied, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "AI failed.", "error");
    } finally {
      setAiWorking(false);
    }
  }

  return { aiWorking, aiResult, handleSelectionAi };
}

export type SelectionAi = ReturnType<typeof useSelectionAi>;

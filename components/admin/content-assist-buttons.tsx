"use client";

import { useState } from "react";

export type AssistCopy = {
  assistExcerpt: string;
  assistSeo: string;
  assistTags: string;
  assistSlug: string;
  assistShare: string;
  assistGroupLabel: string;
  /** The single one-click drafter and the granular disclosure label. */
  assistAll: string;
  /** Honest labels: offline vs LLM. Optional so old dictionaries still type. */
  assistAllOffline?: string;
  assistAi?: string;
  assistAiWorking?: string;
  assistAiOff?: string;
  assistMore: string;
  /** Category / location / alt draft actions. */
  assistCategory: string;
  assistLocation: string;
  assistAlt: string;
  /** Toast when a classifier abstains because the text gives no clear answer. */
  assistUnsure: string;
  /** Toast listing how many fields the one-click pass drafted. */
  assistDraftedCount: string;
  /** Toast when every derived field already had a value. */
  assistNothingToDo: string;
};

type Props = {
  copy: AssistCopy;
  disabled?: boolean;
  /** Honest engine mode: offline heuristics vs real LLM. Never render ✨ as AI when offline. */
  aiEnabled?: boolean;
  aiModel?: string;
  onExcerpt: () => void;
  onSeo: () => void;
  onTags: () => void;
  onSlug: () => void;
  onShare: () => void;
  /** One pass that drafts every empty derived field at once. */
  onDraftAll?: () => void;
  /** True AI pass (Tier 1). Rendered separately so provenance is visible. */
  onDraftAi?: () => void;
  draftingAi?: boolean;
  onCategory?: () => void;
  onLocation?: () => void;
  onAlt?: () => void;
};

/**
 * Smart-assist action row for the content dialogs.
 *
 * Collapsed from five equal buttons into one primary action — "Draft the rest"
 * — with the per-field drafters behind a disclosure. Editor feedback was that
 * the row of five made them guess which derived fields existed; one button that
 * runs every drafter over the empty fields is the 90% case, and granular stays
 * available for the one field that came out wrong. Every pass toasts how many
 * fields it drafted, so the result is reviewable rather than invisible magic.
 */
export function ContentAssistButtons({
  copy,
  disabled,
  aiEnabled,
  aiModel,
  onExcerpt,
  onSeo,
  onTags,
  onSlug,
  onShare,
  onDraftAll,
  onDraftAi,
  draftingAi,
  onCategory,
  onLocation,
  onAlt,
}: Props) {
  const [more, setMore] = useState(false);
  const btn =
    "shrink-0 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";
  const primary =
    "shrink-0 rounded-md border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50";

  return (
    <div className="grid gap-1.5" aria-label={copy.assistGroupLabel}>
      <div className="flex flex-wrap items-center gap-2">
        {onDraftAll ? (
          <button type="button" onClick={onDraftAll} disabled={disabled} className={primary}>
            {aiEnabled ? copy.assistAll : (copy.assistAllOffline ?? copy.assistAll)}
          </button>
        ) : null}
        {onDraftAi ? (
          <button
            type="button"
            onClick={onDraftAi}
            disabled={disabled || draftingAi || !aiEnabled}
            className={primary}
            title={aiEnabled ? `LLM: ${aiModel ?? ''}`.trim() : (copy.assistAiOff ?? 'AI off — configure LLM_API_KEY')}
          >
            {draftingAi ? (copy.assistAiWorking ?? 'Drafting with AI…') : (copy.assistAi ?? '✨ Draft with AI')}
          </button>
        ) : null}
        <span
          role="status"
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${aiEnabled ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground'}`}
          title={aiEnabled ? `LLM: ${aiModel ?? ''}`.trim() : 'Offline heuristics only — no model connected'}
        >
          {aiEnabled ? `AI on${aiModel ? ` · ${aiModel}` : ''}` : 'Offline smart fill'}
        </span>
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          title={copy.assistMore}
        >
          {copy.assistMore}
        </button>
      </div>
      {more ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onExcerpt} disabled={disabled} className={btn}>
            {copy.assistExcerpt}
          </button>
          <button type="button" onClick={onSeo} disabled={disabled} className={btn}>
            {copy.assistSeo}
          </button>
          <button type="button" onClick={onTags} disabled={disabled} className={btn}>
            {copy.assistTags}
          </button>
          <button type="button" onClick={onSlug} disabled={disabled} className={btn}>
            {copy.assistSlug}
          </button>
          <button type="button" onClick={onShare} disabled={disabled} className={btn}>
            {copy.assistShare}
          </button>
          {onCategory ? (
            <button type="button" onClick={onCategory} disabled={disabled} className={btn}>
              {copy.assistCategory}
            </button>
          ) : null}
          {onLocation ? (
            <button type="button" onClick={onLocation} disabled={disabled} className={btn}>
              {copy.assistLocation}
            </button>
          ) : null}
          {onAlt ? (
            <button type="button" onClick={onAlt} disabled={disabled} className={btn}>
              {copy.assistAlt}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


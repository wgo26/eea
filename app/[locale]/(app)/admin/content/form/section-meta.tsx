"use client";

import { ui, Field } from "@/lib/admin/ui-constants";
import type { Dictionary } from "@/lib/i18n";
import type { FormValues } from "./values";
import { Section } from "./shell";
import { useContentAssist } from "./assist";
import type { AuthorSearch } from "./use-author-search";

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];
type Option = { id: string; name: string; slug?: string };

const inputCls = ui.input;

/**
 * Section 4 — Classification: taxonomy, verification, tags, author, byline.
 * Also hosts the below-gate classifier chip (tap-to-apply, never a silent
 * write) and the author picker (state via `useAuthorSearch`).
 */
export function MetaSection(props: {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  copy: Copy;
  common: CommonCopy;
  locations: Option[];
  categories: Option[];
  suggestion: ReturnType<typeof useContentAssist>["suggestion"];
  applySuggestion: ReturnType<typeof useContentAssist>["applySuggestion"];
  setSuggestion: ReturnType<typeof useContentAssist>["setSuggestion"];
  author: AuthorSearch;
}) {
  const { values: v, patch, copy, common, locations, categories, suggestion, applySuggestion, setSuggestion, author } = props;
  const { authorQuery, setAuthorQuery, authorResults, authorSearching, authorOpen, setAuthorOpen, pickAuthor } = author;

  return (
    <Section title={copy.sectionMeta}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.locationLabel}>
          <select
            value={v.locationId}
            onChange={(e) => patch({ locationId: e.target.value })}
            className={inputCls}
          >
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.categoryLabel}>
          <select
            value={v.categoryId}
            onChange={(e) => patch({ categoryId: e.target.value })}
            className={inputCls}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {suggestion ? (
        // Below-gate classifier output: a chip to tap, never a silent write.
        // The rationale is the point of the confidence gate, so it renders
        // inline instead of in a toast that vanishes.
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-2.5 py-1.5 text-xs"
        >
          <span className="font-medium">
            {(copy.assistSuggests ?? 'AI suggests {name} ({pct}%)')
              .replace('{name}', suggestion.name)
              .replace('{pct}', String(Math.round(suggestion.confidence * 100)))}
          </span>
          {suggestion.rationale ? (
            <span className="min-w-0 flex-1 basis-48 text-muted-foreground">— {suggestion.rationale}</span>
          ) : null}
          <button
            type="button"
            onClick={applySuggestion}
            className="shrink-0 rounded-md border border-primary bg-primary/10 px-2 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {copy.assistSuggestApply ?? 'Apply'}
          </button>
          <button
            type="button"
            onClick={() => setSuggestion(null)}
            aria-label={common.close}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.verificationLabel}>
          <select
            value={v.verification}
            onChange={(e) => patch({ verification: e.target.value })}
            className={inputCls}
          >
            <option value="verified">{copy.verificationVerified}</option>
            <option value="community_submission">
              {copy.verificationCommunity}
            </option>
            <option value="official_source">
              {copy.verificationOfficial}
            </option>
            <option value="developing">{copy.verificationDeveloping}</option>
          </select>
        </Field>
        <Field label={copy.tagsLabel} hint={copy.tagsHint}>
          <input
            value={v.tags}
            onChange={(e) => patch({ tags: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label={copy.authorLabel} hint={copy.authorHint}>
        <div className="relative">
          <div
            className={`${inputCls} flex items-center justify-between gap-2`}
          >
            <span
              className={
                v.authorName ? "text-foreground" : "text-muted-foreground"
              }
            >
              {v.authorName || copy.authorNone}
            </span>
            {v.authorId && (
              <button
                type="button"
                onClick={() => pickAuthor(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
                title={copy.authorClear}
              >
                {copy.authorClear}
              </button>
            )}
          </div>
          <input
            value={authorQuery}
            onChange={(e) => {
              setAuthorQuery(e.target.value);
              setAuthorOpen(true);
            }}
            onFocus={() => setAuthorOpen(true)}
            placeholder={copy.authorSearchHint}
            className={`${inputCls} mt-2`}
          />
          {authorOpen &&
            (authorQuery.trim() || authorResults.length > 0) && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-background shadow-lg">
                {authorSearching && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {common.working}
                  </div>
                )}
                {!authorSearching &&
                  authorResults.length === 0 &&
                  authorQuery.trim() && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {common.noResults}
                    </div>
                  )}
                {authorResults.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pickAuthor(a)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span>{a.name}</span>
                    {a.id === v.authorId && (
                      <span className="text-xs text-primary">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
        </div>
      </Field>
      <Field label={copy.bylineLabel} hint={copy.bylineHint}>
        <input
          value={v.byline}
          onChange={(e) => patch({ byline: e.target.value })}
          className={inputCls}
        />
      </Field>
    </Section>
  );
}

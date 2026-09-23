"use client";

export type AssistCopy = {
  assistExcerpt: string;
  assistSeo: string;
  assistTags: string;
  assistSlug: string;
  assistShare: string;
  assistGroupLabel: string;
};

type Props = {
  copy: AssistCopy;
  disabled?: boolean;
  onExcerpt: () => void;
  onSeo: () => void;
  onTags: () => void;
  onSlug: () => void;
  onShare: () => void;
};

/**
 * Smart-assist action row for the content dialogs: one-tap drafts for the
 * repetitive fields (excerpt, SEO, tags, slug, share line). Suggestions are
 * written into the form for review — the editor saves as usual.
 */
export function ContentAssistButtons({ copy, disabled, onExcerpt, onSeo, onTags, onSlug, onShare }: Props) {
  const btn =
    "shrink-0 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={copy.assistGroupLabel}>
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
    </div>
  );
}

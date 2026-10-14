"use client";

import { useMemo } from "react";
import { AiPanel } from "@/components/admin/ai-panel";
import { StoryBlocksEditor } from "@/components/admin/story-blocks-editor";
import { bodyHasStoryBlocks, mergeStoryBlocksIntoBody } from "@/lib/content/blocks";
import type { Dictionary } from "@/lib/i18n";
import { BilingualBody } from "../bilingual-fields";
import type { ContentEditData } from "@/lib/admin/queries";
import type { FormValues } from "./values";
import {
  Section,
  aiPanelCopy,
  proEditorToolbarCopy,
  storyBlocksCopy,
} from "./shell";
import type { SelectionAi } from "./use-selection-ai";

type Copy = Dictionary["admin"]["content"];

/**
 * Section 2 — Story: pro WYSIWYG bodies + section builder + selection AI
 * rail. Copy adapters are memoized here (they were in the form root).
 */
export function StorySection(props: {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  markTouched: (field: string) => void;
  copy: Copy;
  isEdit: boolean;
  data?: NonNullable<ContentEditData>;
  draftingAi: boolean;
  selectionAi: SelectionAi;
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const { values: v, patch, markTouched, copy, isEdit, data, draftingAi, selectionAi, addToast } = props;
  const { aiWorking, aiResult, handleSelectionAi } = selectionAi;

  const blocksCopy = storyBlocksCopy(copy);
  const toolbarCopy = useMemo(() => proEditorToolbarCopy(copy), [copy]);
  const panelCopy = useMemo(() => aiPanelCopy(copy), [copy]);
  const photoUrlsForEditor = useMemo(() => {
    const existing = isEdit && data ? data.photos.map((p) => p.url) : [];
    return [...existing, ...v.newPhotos.map((p) => p.url)].filter(Boolean);
  }, [isEdit, data, v.newPhotos]);

  return (
    <Section title={copy.sectionStory}>
      <BilingualBody
        copy={copy}
        enBody={v.enBody}
        frBody={v.frBody}
        onBody={(locale, val) => {
          markTouched(locale === "en" ? "enBody" : "frBody");
          patch(locale === "en" ? { enBody: val } : { frBody: val });
        }}
        toolbar={toolbarCopy}
        photoUrls={photoUrlsForEditor}
      />
      <AiPanel copy={panelCopy} disabled={false} working={aiWorking || draftingAi} onAction={(kind, instruction) => void handleSelectionAi(kind, instruction)} lastResult={aiResult} />
      <StoryBlocksEditor
        copy={blocksCopy}
        initialBody={v.enBody}
        photoUrls={
          isEdit && data
            ? [
                ...data.photos.map((p) => p.url),
                ...v.newPhotos.map((p) => p.url),
              ].filter(Boolean)
            : v.newPhotos.map((p) => p.url).filter(Boolean)
        }
        onInsert={(html) =>
          // Idempotent: re-inserting replaces the previously inserted
          // sections instead of appending a second copy of every picture.
          patch({ enBody: mergeStoryBlocksIntoBody(v.enBody, html) })
        }
        onToast={addToast}
        contentItemId={isEdit && data ? data.id : undefined}
        onExcerptPreview={(excerpt, count) => {
          // FR-9/FR-10: only fill an empty excerpt, never overwrite one.
          if (count > 1 && excerpt && !v.enExcerpt.trim())
            patch({ enExcerpt: excerpt });
        }}
         onBlockAdded={
           isEdit
             ? () => {
                 // Auto-insert story sections into an existing body only when
                 // the body doesn't already contain story-blocks markup —
                 // avoids duplicating on re-open of a post that already has them.
                 if (!bodyHasStoryBlocks(v.enBody)) {
                   addToast(copy.blocksInserted, "success");
                   return true;
                 }
                 return false;
               }
             : () => {
                 if (!v.enBody.trim()) {
                   addToast(copy.blocksInserted, "success");
                   return true;
                 }
                 return false;
               }
         }
      />
    </Section>
  );
}

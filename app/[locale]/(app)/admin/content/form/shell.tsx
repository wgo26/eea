"use client";
/* eslint-disable react-hooks/set-state-in-effect -- a stored draft is read exactly once per mount, by design (see the mount-only effect below) */

/**
 * Shared chrome for the admin content forms: the per-component copy mappers
 * (one place so the block editor and media uploader cannot be configured
 * differently on the two surfaces), the labeled `Section` wrapper, and the
 * debounced local-draft hook.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import type { StoryBlocksCopy } from "@/components/admin/story-blocks-editor";
import type { ProEditorToolbarCopy } from "@/components/admin/pro-editor";
import type { AiPanelCopy } from "@/components/admin/ai-panel";
import {
  clearDraft,
  isDraftWorthRestoring,
  readDraft,
  writeDraft,
} from "@/lib/content/draft-autosave";
import type { FormValues } from "./values";

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];

/** Shared StoryBlocksEditor copy mapping (was duplicated per dialog). */
export function storyBlocksCopy(copy: Copy): StoryBlocksCopy {
  return {
    sectionTitle: copy.blocksTitle,
    sectionHint: copy.blocksHint,
    addBlock: copy.blocksAdd,
    addTextSection: copy.blocksAddText,
    addImageSection: copy.blocksAddImage,
    addVideoSection: copy.blocksAddVideo,
    addMediaSection: copy.blocksAddMedia,
    addGallerySection: copy.blocksAddGallery,
    addCtaSection: copy.blocksAddCta,
    addDividerSection: copy.blocksAddDivider,
    insertIntoBody: copy.blocksInsert,
    inserted: copy.blocksInserted,
    empty: copy.blocksEmpty,
    headingLabel: copy.blocksHeading,
    headingPlaceholder: copy.blocksHeadingPh,
    bodyLabel: copy.blocksBody,
    bodyPlaceholder: copy.blocksBodyPh,
    imageLabel: copy.blocksImage,
    imagePlaceholder: copy.blocksImagePh,
    uploadImage: copy.blocksUploadImage,
    altLabel: copy.blocksAlt,
    captionLabel: copy.blocksCaption,
    layoutLabel: copy.blocksLayout,
    layoutTop: copy.blocksLayoutTop,
    layoutLeft: copy.blocksLayoutLeft,
    layoutRight: copy.blocksLayoutRight,
    moveUp: copy.blocksMoveUp,
    moveDown: copy.blocksMoveDown,
    removeBlock: copy.blocksRemove,
    blockTitle: copy.blocksBlock,
    pickFromPhotos: copy.blocksPickPhotos,
    pickManyPhotos: copy.blocksPickManyPhotos,
    videoUrlLabel: copy.blocksVideoUrl,
    videoUrlPlaceholder: copy.blocksVideoUrlPh,
    videoThumbnailLabel: copy.blocksVideoThumbnail,
    galleryImages: copy.blocksGalleryImages,
    ctaTextLabel: copy.blocksCtaText,
    ctaTextPlaceholder: copy.blocksCtaTextPh,
    ctaLinkLabel: copy.blocksCtaLink,
    ctaLinkPlaceholder: copy.blocksCtaLinkPh,
    removeImage: copy.blocksRemoveImage,
    mediaUrlLabel: copy.blocksMediaUrl,
    mediaUrlPlaceholder: copy.blocksMediaUrlPh,
    mediaKindLabel: copy.blocksMediaKind,
    mediaKindVideo: copy.blocksMediaKindVideo,
    mediaKindAudio: copy.blocksMediaKindAudio,
    mediaKindDocument: copy.blocksMediaKindDocument,
    mediaPosterLabel: copy.blocksMediaPoster,
  };
}

/** Shared pro-editor toolbar copy (dictionary-driven, no hardcoded labels). */
export function proEditorToolbarCopy(copy: Copy): ProEditorToolbarCopy {
  return {
    bold: copy.editorBold,
    italic: copy.editorItalic,
    underline: copy.editorUnderline,
    strike: copy.editorStrike,
    h2: copy.editorH2,
    quote: copy.editorQuote,
    alignLeft: copy.editorAlignLeft,
    alignCenter: copy.editorAlignCenter,
    alignRight: copy.editorAlignRight,
    alignJustify: copy.editorAlignJustify,
    bulletList: copy.editorBulletList,
    orderedList: copy.editorOrderedList,
    link: copy.editorLink,
    image: copy.editorImage,
    statsWords: copy.editorWords,
    statsChars: copy.editorChars,
    statsRead: copy.editorReadTime,
    statsMin: copy.editorMin,
  };
}

/** Shared AI panel copy. */
export function aiPanelCopy(copy: Copy): AiPanelCopy {
  return {
    title: copy.aiPanelTitle,
    hint: copy.aiPanelHint,
    improve: copy.aiImprove,
    complete: copy.aiComplete,
    tone: copy.aiTone,
    seo: copy.aiSeo,
    readability: copy.aiReadability,
    headline: copy.aiHeadline,
    summary: copy.aiSummary,
    tags: copy.aiTags,
    modalTitle: copy.aiModalTitle,
    modalPlaceholder: copy.aiModalPlaceholder,
    cancel: copy.aiModalCancel,
    generate: copy.aiModalGenerate,
    working: copy.aiModalWorking,
  };
}

/** Shared MediaUploader copy mapping (was duplicated per dialog). */
export function mediaUploaderCopy(common: CommonCopy, copy: Copy) {
  return {
    pickerCopy: {
      title: common.mediaLibrary,
      search: common.mediaLibrary,
      searchPlaceholder: common.mediaSearchPlaceholder,
      noResults: common.mediaNoResults,
      loading: common.mediaLoading,
      cancel: common.mediaCancel,
      select: common.mediaSelect,
      images: common.mediaImages,
      all: common.mediaAll,
      reuse: common.mediaReuse,
    },
    copy: {
      label: copy.photosLabel,
      hint: copy.photosHint,
      browseFiles: common.browseFiles,
      dropHere: common.dropHere,
      or: common.orPasteUrl,
      urlPlaceholder: "https://…",
      addUrl: common.addUrl,
      existing: copy.photosExisting,
      altLabel: common.altLabel,
      captionLabel: common.captionLabel,
      creditLabel: copy.photographerCredit,
      cover: common.cover,
      setCover: common.setCover,
      uploading: common.photoUploading,
      uploadError: common.photoUploadError,
      tooLarge: common.photoTooLarge,
      wrongType: common.photoWrongType,
      empty: common.noPhotos,
    },
  };
}

/** Labeled form region — the sections shared by create and edit. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Debounced local autosave for an unsaved form (see lib/content/draft-autosave).
 *
 * Returns the banner state plus restore/discard actions. A draft is offered,
 * never applied, and writing is skipped until the first change after mount —
 * otherwise merely opening a post would create a "newer" draft that shadows the
 * saved row on next open.
 */
export function useDraftAutosave(opts: {
  keyName: string;
  values: FormValues;
  dirty: boolean;
  /** Row's own last-update time in epoch ms (0 for create mode). */
  savedAtMs: number;
  setValues: (next: FormValues) => void;
}) {
  const { keyName, values, dirty, savedAtMs, setValues } = opts;
  const [pending, setPending] = useState<StoredDraftView | null>(null);
  const skipFirstWrite = useRef(true);

  // Offer a recoverable draft exactly once per mount.
  useEffect(() => {
    const stored = readDraft<FormValues>(keyName);
    if (isDraftWorthRestoring(stored, savedAtMs)) {
      setPending({ savedAt: stored.savedAt, values: stored.values });
    }
    // Deliberately mount-only: re-reading on every keyName change would fight
    // the editor's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipFirstWrite.current) {
      skipFirstWrite.current = false;
      return;
    }
    if (!dirty) return;
    const t = setTimeout(() => writeDraft(keyName, values), 800);
    return () => clearTimeout(t);
  }, [values, dirty, keyName]);

  const restore = useCallback(() => {
    if (!pending) return;
    setValues(pending.values);
    setPending(null);
  }, [pending, setValues]);

  const discard = useCallback(() => {
    clearDraft(keyName);
    setPending(null);
  }, [keyName]);

  return { pending, restore, discard };
}

export type StoredDraftView = { savedAt: number; values: FormValues };

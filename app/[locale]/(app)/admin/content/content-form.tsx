"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAdminMutation } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import { useLocaleFromPath } from "@/components/site-header";
import { ContentPreview } from "./content-preview";
import type { Dictionary } from "@/lib/i18n";
import type { ContentEditData } from "@/lib/admin/queries";
import {
  formatDraftAge,
  useContentForm,
  type ContentType,
  type FormValues,
} from "./form/values";
import { useDraftAutosave } from "./form/shell";
import { draftKey } from "@/lib/content/draft-autosave";
import { useContentTranslator } from "@/components/admin/translate-buttons";
import { buildReadinessChecks } from "@/components/admin/publish-readiness";
import { useContentAssist } from "./form/assist";
import { useAuthorSearch } from "./form/use-author-search";
import { useSelectionAi } from "./form/use-selection-ai";
import { useContentSubmit } from "./form/use-content-submit";
import { DetailsSection } from "./form/section-details";
import { StorySection } from "./form/section-story";
import { MediaSection } from "./form/section-media";
import { MetaSection } from "./form/section-meta";
import { TypeSection } from "./form/section-type";
import { SeoSection } from "./form/section-seo";
import { PublishingSection } from "./form/section-publishing";

// The value model lives in ./form/values so the moderation approve form builds
// the same payload this one does. Re-exported because content-preview.tsx and
// the dialog shells already import FormValues from this module.
export type { FormValues } from "./form/values";

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];
type TypeFilters = Dictionary["admin"]["typeFilters"];
type Option = { id: string; name: string; slug?: string };

const btnSecondary =
  "inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground";

export type ContentFormProps = {
  /** create = blank form + publish modes; edit = prefilled, no mode switch.
   *  approve = the create form seeded from a submission, submitting through
   *  approveSubmissionWithContent so the submission is claimed in the same step. */
  mode: "create" | "edit" | "approve";
  copy: Copy;
  common: CommonCopy;
  typeFilters: TypeFilters;
  locations: Option[];
  categoriesByType: Record<string, Option[]>;
  /** Edit mode: the loaded row. Create/approve mode: undefined. */
  data?: NonNullable<ContentEditData>;
  /** Edit mode appends a children slot (ContentHistory) above the footer. */
  children?: React.ReactNode;
  /** Editor vs live-preview pane. State lives in the dialog shell (its tabs
   *  render in the sticky header); the form stays mounted either way. */
  tab?: "editor" | "preview";
  /** Called after a successful save (the dialog closes itself). */
  onDone: () => void;
  /**
   * Approve mode: the submission being turned into a post. The form submits
   * through approveSubmissionWithContent, which claims the submission and
   * creates the item in one step — so a reviewer is never left with an approved
   * row that has no content behind it.
   */
  approve?: {
    submissionId: string
    /** Field values mapped off the submission payload (see lib/content/submission-prefill). */
    prefill: Partial<FormValues>
    /** Which payload keys could not be placed, so the reviewer knows what to read. */
    unmapped?: string[]
    /** Submission type, which fixes the content type (the type select stays locked). */
    submissionType?: string
  };
};

/**
 * The single content form behind every surface that writes a post: the Content
 * screen's create and edit dialogs, and the moderation approve dialog. Six
 * labeled sections — Details, Story, Media, Classification, type-specific, SEO,
 * Publishing — plus the preview pane, autosave and the intelligence layer.
 *
 * It exists because two hand-maintained copies of one form drift: the approve
 * dialog shipped without story blocks, tags, slug, SEO, byline, share line,
 * event fields, alt text, media library, preview, keyboard save or autosave, so
 * a post approved from the queue was a lesser artifact than one created in
 * Content, and the editor had to reopen the edit drawer to finish it.
 *
 * Structure: this file owns cross-section state only (values, autosave,
 * translator, assist, submit). Each section renders from `./form/section-*`
 * (details/story/media/meta/type/seo/publishing); per-section hooks live in
 * `./form/use-*`. Nothing here may grow a new field — add it to the section
 * that owns it.
 */
export function ContentForm({
  mode,
  copy,
  common,
  typeFilters,
  locations,
  categoriesByType,
  data,
  children,
  tab = "editor",
  onDone,
  approve,
}: ContentFormProps) {
  const { run, loading } = useAdminMutation();
  const { addToast } = useToast();
  const isEdit = mode === "edit" && !!data;
  const isApprove = mode === "approve";
  const locale = useLocaleFromPath();

  const { values: v, patch, dirty, reset, setValues, touched, markTouched } =
    useContentForm(data, isApprove ? approve?.prefill : undefined);

  // Taxonomy options for the current type, shared by the selects and the
  // auto-fill pass. `categoriesByType` is already loaded for the dialog, so
  // drafting a category costs no query.
  const categoryOptions = useMemo(
    () => categoriesByType[v.type] ?? [],
    [categoriesByType, v.type],
  );
  // Approve mode gets its own slot: two submissions open at once must not
  // share the blank "new" draft the create dialog uses.
  const draftSlot =
    isEdit && data
      ? data.id
      : isApprove && approve
        ? `submission-${approve.submissionId}`
        : null;
  const localDraft = useDraftAutosave({
    keyName: draftKey(draftSlot),
    values: v,
    dirty,
    savedAtMs: isEdit && data?.updatedAt ? Date.parse(data.updatedAt) : 0,
    setValues,
  });
  const formRef = useRef<HTMLFormElement>(null);

  // Ctrl/Cmd+S saves from anywhere in the dialog — the sticky dock advertises
  // the shortcut, so the handler must be real (Phase B action dock).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!loading) form.requestSubmit();
      }
    };
    form.addEventListener("keydown", onKey);
    return () => form.removeEventListener("keydown", onKey);
  }, [loading]);

  const author = useAuthorSearch(patch);

  const { translate, translating } = useContentTranslator({
    copy,
    read: () => ({
      en: {
        title: v.enTitle,
        excerpt: v.enExcerpt,
        body: v.enBody,
        seoDescription: v.enSeo,
      },
      fr: {
        title: v.frTitle,
        excerpt: v.frExcerpt,
        body: v.frBody,
        seoDescription: v.frSeo,
      },
    }),
    write: (locale, f) => {
      if (locale === "fr") {
        patch({
          frTitle: f.title,
          frExcerpt: f.excerpt,
          frBody: f.body,
          frSeo: f.seoDescription,
        });
      } else {
        patch({
          enTitle: f.title,
          enExcerpt: f.excerpt,
          enBody: f.body,
          enSeo: f.seoDescription,
        });
      }
    },
  });

  const type: ContentType = isEdit && data ? (data.type as ContentType) : v.type;
  const categories = categoriesByType[type] ?? [];

  const readinessChecks = isEdit
    ? []
    : buildReadinessChecks(
        type,
        v.enTitle,
        v.frTitle,
        v.locationId,
        v.categoryId,
        Boolean(v.newPhotos.length > 0),
        v.frExcerpt ?? "",
        copy,
        {
          missingAltCount: v.newPhotos.filter(
            (p) => !p.alt?.trim() && p.kind !== "video" && p.kind !== "audio",
          ).length,
        },
      );
  const needsReadiness = !isEdit && v.publish !== "draft";

  // The intelligence layer lives in ./form/assist so the moderation approve
  // form gets the identical drafting help (and identical provenance honesty).
  const assist = useContentAssist({
    values: v,
    patch,
    copy,
    addToast,
    locations,
    categoryOptions,
    touched,
    markTouched,
    isEdit,
  });

  const selectionAi = useSelectionAi({ values: v, patch, copy, addToast });

  const handleSubmit = useContentSubmit({
    mode,
    data,
    approve,
    values: v,
    type,
    locale,
    copy,
    draftSlot,
    run,
    addToast,
    onDone,
  });

  // Stable identity for the media subtree (see MediaSection): derived here
  // because edit-mode rows come from `data`, not the form values.
  const mediaExistingPhotos = useMemo(
    () =>
      isEdit && data
        ? data.photos.map((p) => ({
            id: p.id,
            url: p.url,
            alt: p.alt,
            caption: p.caption,
            credit: p.credit,
            isCover: p.is_cover ?? false,
          }))
        : undefined,
    [isEdit, data],
  );
  const mediaItemId = isEdit && data ? data.id : undefined;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-4">
      {tab === "editor" ? (
        <>
      {/* Recovery affordance: a local autosave is offered, never applied, so
          two dialogs open at once can never silently overwrite each other. */}
      {localDraft.pending ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              {copy.draftFoundTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {copy.draftFoundHint.replace(
                "{when}",
                formatDraftAge(localDraft.pending.savedAt, copy),
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                localDraft.restore();
                addToast(copy.draftToastRestored, "success");
              }}
              className={btnSecondary}
            >
              {copy.draftRestore}
            </button>
            <button
              type="button"
              onClick={localDraft.discard}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {copy.draftDiscard}
            </button>
          </div>
        </div>
      ) : null}

      <DetailsSection
        isEdit={isEdit}
        isApprove={isApprove}
        unmappedKeys={isApprove ? (approve?.unmapped ?? []) : []}
        values={v}
        patch={patch}
        copy={copy}
        typeFilters={typeFilters}
        translate={translate}
        translating={translating}
        assist={assist.assist}
        aiEnabled={assist.aiEnabled}
        aiModel={assist.aiModel}
        aiBudget={assist.aiBudget}
        handleDraftAi={assist.handleDraftAi}
        draftingAi={assist.draftingAi}
        lastDraft={assist.lastDraft}
        describeFields={assist.describeFields}
        undoLastDraft={assist.undoLastDraft}
        headlines={assist.headlines}
        setHeadlines={assist.setHeadlines}
        handleHeadlines={assist.handleHeadlines}
        headlinesWorking={assist.headlinesWorking}
        verifyState={assist.verifyState}
        setVerifyState={assist.setVerifyState}
        handleVerify={assist.handleVerify}
        verifyWorking={assist.verifyWorking}
        addToast={addToast}
      />

      <StorySection
        values={v}
        patch={patch}
        markTouched={markTouched}
        copy={copy}
        isEdit={isEdit}
        data={data}
        draftingAi={assist.draftingAi}
        selectionAi={selectionAi}
        addToast={addToast}
      />

      <MediaSection
        values={v}
        patch={patch}
        copy={copy}
        common={common}
        existingPhotos={mediaExistingPhotos}
        mediaItemId={mediaItemId}
      />

      <MetaSection
        values={v}
        patch={patch}
        copy={copy}
        common={common}
        locations={locations}
        categories={categories}
        suggestion={assist.suggestion}
        applySuggestion={assist.applySuggestion}
        setSuggestion={assist.setSuggestion}
        author={author}
      />

      <TypeSection type={type} values={v} patch={patch} copy={copy} />

      <SeoSection
        values={v}
        patch={patch}
        markTouched={markTouched}
        copy={copy}
        isEdit={isEdit}
        aiEnabled={assist.aiEnabled}
        repurpose={assist.repurpose}
        repurposeWorking={assist.repurposeWorking}
        handleRepurpose={assist.handleRepurpose}
        addToast={addToast}
      />

      <PublishingSection
        isEdit={isEdit}
        isApprove={isApprove}
        values={v}
        patch={patch}
        copy={copy}
        common={common}
        needsReadiness={needsReadiness}
        readinessChecks={readinessChecks}
        loading={loading}
        dirty={dirty}
        reset={reset}
        onDone={onDone}
      >
        {children}
      </PublishingSection>
        </>
      ) : (
        <ContentPreview
          v={v}
          dataPhotos={data?.photos ?? []}
          copy={copy}
          common={common}
          locale={locale}
        />
      )}
    </form>
  );
}

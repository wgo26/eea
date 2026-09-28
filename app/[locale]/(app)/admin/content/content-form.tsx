"use client";
/* eslint-disable react-hooks/set-state-in-effect -- debounced author search mirrors the existing dialogs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createContentItem,
  saveContentItem,
  searchAuthors,
} from "@/lib/admin/actions/content";
import { approveSubmissionWithContent } from "@/lib/admin/actions/moderation";
import {
  useContentTranslator,
  TranslateButtons,
} from "@/components/admin/translate-buttons";
import { ContentAssistButtons } from "@/components/admin/content-assist-buttons";
import { StoryBlocksEditor } from "@/components/admin/story-blocks-editor";
import { bodyHasStoryBlocks, mergeStoryBlocksIntoBody } from "@/lib/content/blocks";
import { clearDraft, draftKey } from "@/lib/content/draft-autosave";
import { useAdminMutation } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast";
import {
  PublishReadiness,
  buildReadinessChecks,
} from "@/components/admin/publish-readiness";
import { DialogFooter } from "@/components/ui/dialog";
import {
  MediaUploader,
  CONTENT_MEDIA_ACCEPTS,
} from "@/components/admin/media-uploader";
import type { UploadedPhoto } from "@/components/admin/media-uploader";
import { ui, Field } from "@/lib/admin/ui-constants";
import { useLocaleFromPath } from "@/components/site-header";
import { ContentPreview } from "./content-preview";
import {
  BilingualBody,
  BilingualExcerpts,
  BilingualHeadings,
  BilingualSeo,
} from "./bilingual-fields";
import type { Dictionary } from "@/lib/i18n";
import type { ContentEditData } from "@/lib/admin/queries";
import {
  CONTENT_TYPES,
  TYPE_DICT_KEYS,
  formatDraftAge,
  payloadFromForm,
  useContentForm,
  type ContentType,
  type FormValues,
} from "./form/values";
import {
  Section,
  mediaUploaderCopy,
  storyBlocksCopy,
  useDraftAutosave,
} from "./form/shell";
import { useContentAssist } from "./form/assist";

// The value model lives in ./form/values so the moderation approve form builds
// the same payload this one does. Re-exported because content-preview.tsx and
// the dialog shells already import FormValues from this module.
export type { FormValues } from "./form/values";

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];
type TypeFilters = Dictionary["admin"]["typeFilters"];
type Option = { id: string; name: string; slug?: string };


const inputCls = ui.input;
const btnPrimary = ui.btnPrimary;
const btnSecondary = ui.btnSecondary;
const btnGhost = ui.btnGhost;









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

  // Author search (profile author picker) — debounced, shared by both modes.
  const [authorQuery, setAuthorQuery] = useState("");
  const [authorResults, setAuthorResults] = useState<
    { id: string; name: string }[]
  >([]);
  const [authorSearching, setAuthorSearching] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const authorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authorTimer.current) clearTimeout(authorTimer.current);
    if (!authorQuery.trim()) {
      setAuthorResults([]);
      setAuthorSearching(false);
      return;
    }
    setAuthorSearching(true);
    authorTimer.current = setTimeout(async () => {
      const res = await searchAuthors(authorQuery.trim());
      setAuthorResults(res);
      setAuthorSearching(false);
    }, 250);
    return () => {
      if (authorTimer.current) clearTimeout(authorTimer.current);
    };
  }, [authorQuery]);

  function pickAuthor(a: { id: string; name: string } | null) {
    if (a) {
      patch({ authorId: a.id, authorName: a.name });
    } else {
      patch({ authorId: null, authorName: "" });
    }
    setAuthorQuery("");
    setAuthorResults([]);
    setAuthorOpen(false);
  }

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

  const type = isEdit && data ? data.type : v.type;
  const categories = categoriesByType[type] ?? [];
  const isListing = type === "listing";
  const isNotice = type === "notice";
  const isCulture = type === "culture";

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
  const {
    aiEnabled,
    aiModel,
    aiBudget,
    draftingAi,
    handleDraftAi,
    lastDraft,
    undoLastDraft,
    describeFields,
    suggestion,
    setSuggestion,
    applySuggestion,
    headlines,
    setHeadlines,
    headlinesWorking,
    handleHeadlines,
    verifyState,
    setVerifyState,
    verifyWorking,
    handleVerify,
    repurpose,
    repurposeWorking,
    handleRepurpose,
    assist,
  } = useContentAssist({
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isEdit && data) {
      // ---- save existing item (payload mirrors the old ContentEditForm) ----
      if (isListing && v.price.trim() !== "" && Number.isNaN(Number(v.price))) {
        addToast(copy.priceLabel ?? "Enter a valid price.", "error");
        return;
      }
      const payload = payloadFromForm(v, data);
      if (payload.kind !== "save") return;
      const ok = await run(
        () => saveContentItem(payload.contentItemId, payload.draft, locale === 'fr' ? 'fr' : 'en'),
        copy.toastUpdated ?? "Saved.",
      );
      // The row now holds everything the autosave held, so the local copy is
      // stale by definition — leaving it would offer it back on next open.
      if (ok) clearDraft(draftKey(payload.contentItemId));
      if (ok) onDone();
      return;
    }

    // ---- approve a submission: same payload, plus the claim ---------------
    if (isApprove && approve) {
      const created = payloadFromForm(v, null);
      if (created.kind !== "create") return;
      const ok = await run(
        () =>
          approveSubmissionWithContent({
            submissionId: approve.submissionId,
            draft: created.input.draft,
            publish: created.input.publish,
            scheduledFor: created.input.scheduledFor,
            expiresAt: created.input.expiresAt,
          }),
        v.publish === "now"
          ? copy.approveToastPublished
          : v.publish === "schedule"
            ? copy.approveToastScheduled
            : copy.approveToastDraft,
      );
      if (ok) clearDraft(draftKey(draftSlot));
      if (ok) onDone();
      return;
    }

    // ---- create new item (payload mirrors the old ContentCreateDialog) ----
    if (v.publish === "schedule" && !v.scheduledFor.trim()) {
      addToast(copy.scheduledFor ?? "Pick a date/time first.", "error");
      return;
    }
    if (
      type === "listing" &&
      v.price.trim() !== "" &&
      Number.isNaN(Number(v.price))
    ) {
      addToast(copy.priceLabel ?? "Enter a valid price.", "error");
      return;
    }
    const created = payloadFromForm(v, null);
    if (created.kind !== "create") return;

    const toast =
      v.publish === "now"
        ? copy.toastPublished
        : v.publish === "schedule"
          ? copy.toastScheduled
          : (copy.toastCreated ?? copy.toastPublished);
    const ok = await run(() => createContentItem(created.input), toast);
    // A created row supersedes the local draft it was written from; for a new
    // item the key is the shared "new" slot, so clearing it also stops a blank
    // template being offered back as a recovery on the next post.
    if (ok) clearDraft(draftKey(null));
    if (ok) onDone();
  }

  const blocksCopy = storyBlocksCopy(copy);
  const mediaCopy = useMemo(() => mediaUploaderCopy(common, copy), [common, copy]);

  // Stable identities for the media subtree's props. `MediaUploader` renders one
  // DOM node per photo, and the form re-renders on every keystroke of an
  // unrelated field; rebuilding these arrays/objects inline defeated any
  // memoization at that boundary, so a 60-photo story reconciled 60 tiles per
  // character typed.
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
  const onMediaChange = useCallback(
    (next: { keepIds: string[]; newPhotos: UploadedPhoto[] }) =>
      patch({ keepIds: next.keepIds, newPhotos: next.newPhotos }),
    [patch],
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

      {/* 1 — Details: type, bilingual titles + excerpts, translate/assist. */}
      <Section title={copy.sectionDetails}>
        {!isEdit &&
          (isApprove ? (
            // The content type is decided by the submission, not the reviewer:
            // approveSubmissionWithContent derives it from
            // SUBMISSION_TO_CONTENT and the server has the last word. Showing a
            // live select here would let someone pick a type the post could not
            // become, so it reads as a fixed fact.
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{copy.type}:</span>
              <span className="font-medium text-foreground">
                {typeFilters[TYPE_DICT_KEYS[v.type]] ?? v.type}
              </span>
            </div>
          ) : (
            <Field label={copy.type}>
              <select
                value={v.type}
                onChange={(e) =>
                  patch({
                    type: e.target.value as ContentType,
                    categoryId: "",
                  })
                }
                className={inputCls}
              >
                {CONTENT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {typeFilters[TYPE_DICT_KEYS[ct]] ?? ct}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        {isApprove && approve?.unmapped?.length ? (
          // Nothing in a submission may vanish quietly: the reviewer is told
          // which keys the form could not place, and reads them in the
          // submitted-content panel beside the form.
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            {copy.unmappedNotice.replace("{keys}", approve.unmapped.join(", "))}
          </p>
        ) : null}
        <BilingualHeadings
          copy={copy}
          enTitle={v.enTitle}
          frTitle={v.frTitle}
          onTitle={(locale, val) =>
            patch(locale === "en" ? { enTitle: val } : { frTitle: val })
          }
          required={!isEdit}
          showHint={!isEdit && v.publish !== "draft"}
        />
        <TranslateButtons
          copy={copy}
          translate={translate}
          translating={translating}
        />
        {copy.translateHint ? (
          <p className="text-xs text-muted-foreground">{copy.translateHint}</p>
        ) : null}
        <ContentAssistButtons
          copy={copy}
          {...assist}
          aiEnabled={aiEnabled}
          aiModel={aiModel}
          aiBudget={aiBudget}
          onDraftAi={handleDraftAi}
          draftingAi={draftingAi}
        />
        {lastDraft && lastDraft.fields.length > 0 ? (
          // Provenance, reviewable: which fields the last pass wrote and with
          // what engine — plus a one-tap undo that restores the prior values.
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
          >
            <span className="text-muted-foreground">
              {(copy.assistLastDraft ?? '{engine} drafted: {fields}')
                .replace(
                  '{engine}',
                  lastDraft.engine === 'llm'
                    ? (copy.assistEngineAi as string | undefined) ?? 'AI'
                    : (copy.assistEngineOffline as string | undefined) ?? 'Offline',
                )
                .replace('{fields}', describeFields(lastDraft.fields).join(', '))}
            </span>
            <button
              type="button"
              onClick={undoLastDraft}
              className="shrink-0 rounded-md border border-border px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copy.assistUndo ?? 'Undo drafting pass'}
            </button>
          </div>
        ) : null}
        {/* P2 — AI headline options (EN/FR pickers, apply-on-tap). */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleHeadlines("en")}
            disabled={!aiEnabled || headlinesWorking !== null}
            className={btnSecondary}
            title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
          >
            {headlinesWorking === "en" ? (copy.assistHeadlinesWorking as string) : `${copy.assistHeadlines as string} EN`}
          </button>
          <button
            type="button"
            onClick={() => void handleHeadlines("fr")}
            disabled={!aiEnabled || headlinesWorking !== null}
            className={btnSecondary}
            title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
          >
            {headlinesWorking === "fr" ? (copy.assistHeadlinesWorking as string) : `${copy.assistHeadlines as string} FR`}
          </button>
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={!aiEnabled || verifyWorking}
            className={btnSecondary}
            title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
          >
            {verifyWorking ? (copy.assistVerifyWorking as string) : (copy.assistVerify as string)}
          </button>
        </div>
        {headlines ? (
          <div role="status" className="grid gap-1.5 rounded-md border border-border bg-muted/40 p-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI headlines · {headlines.locale.toUpperCase()}
            </p>
            {headlines.items.map((h) => (
              <div key={h} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{h}</span>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    patch(headlines.locale === "en" ? { enTitle: h } : { frTitle: h });
                    addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · headline)`, "success");
                  }}
                >
                  {copy.assistApplyHeadline as string}
                </button>
              </div>
            ))}
            <button type="button" className="justify-self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setHeadlines(null)}>
              ×
            </button>
          </div>
        ) : null}
        {verifyState ? (
          <div role="status" className="grid gap-1.5 rounded-md border border-border bg-muted/40 p-2.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI verification · {verifyState.badge}
            </p>
            {verifyState.reasons.map((r) => (
              <p key={r} className="text-xs text-muted-foreground">• {r}</p>
            ))}
            {verifyState.checklist.map((c) => (
              <p key={c} className="text-xs">☐ {c}</p>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  patch({ verification: verifyState.badge });
                  addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · verification)`, "success");
                }}
              >
                {copy.assistVerifyApply as string}: {verifyState.badge}
              </button>
              <button type="button" className={btnGhost} onClick={() => setVerifyState(null)}>
                ×
              </button>
            </div>
          </div>
        ) : null}
        <BilingualExcerpts
          copy={copy}
          enExcerpt={v.enExcerpt}
          frExcerpt={v.frExcerpt}
          onExcerpt={(locale, val) =>
            patch(locale === "en" ? { enExcerpt: val } : { frExcerpt: val })
          }
        />
      </Section>

      {/* 2 — Story: bilingual body + visual section builder. */}
      <Section title={copy.sectionStory}>
        <BilingualBody
          copy={copy}
          enBody={v.enBody}
          frBody={v.frBody}
          onBody={(locale, val) =>
            patch(locale === "en" ? { enBody: val } : { frBody: val })
          }
        />
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

      {/* 3 — Media: uploads/picks, credit, supporting links. */}
      <Section title={copy.sectionMedia}>
        <MediaUploader
          existingPhotos={mediaExistingPhotos}
          keepIds={v.keepIds}
          newPhotos={v.newPhotos}
          onChange={onMediaChange}
          contentItemId={mediaItemId}
          destination="public_photo"
          acceptedTypes={CONTENT_MEDIA_ACCEPTS}
          maxSizeBytes={50 * 1024 * 1024}
          pickerCopy={mediaCopy.pickerCopy}
          copy={mediaCopy.copy}
        />
        <Field label={copy.photographerCredit}>
          <input
            value={v.credit}
            onChange={(e) => patch({ credit: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={copy.videoUrls} hint={copy.videoUrlsHint}>
            <textarea
              value={v.videos}
              onChange={(e) => patch({ videos: e.target.value })}
              rows={2}
              className={inputCls}
              placeholder="https://…"
            />
          </Field>
          <Field label={copy.audioUrls} hint={copy.audioUrlsHint}>
            <textarea
              value={v.audios}
              onChange={(e) => patch({ audios: e.target.value })}
              rows={2}
              className={inputCls}
              placeholder="https://…"
            />
          </Field>
          <Field label={copy.documentUrls} hint={copy.documentUrlsHint}>
            <textarea
              value={v.documents}
              onChange={(e) => patch({ documents: e.target.value })}
              rows={2}
              className={inputCls}
              placeholder="https://…"
            />
          </Field>
        </div>
      </Section>

      {/* 4 — Classification: taxonomy, verification, tags, author, byline. */}
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

      {/* 5 — Type-specific details (plain sections, no accordions). */}
      {isListing && (
        <Section title={copy.listingDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.priceLabel}>
              <input
                type="number"
                min="0"
                value={v.price}
                onChange={(e) => patch({ price: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.currencyLabel}>
              <input
                value={v.currency}
                onChange={(e) => patch({ currency: e.target.value })}
                maxLength={3}
                className={inputCls}
              />
            </Field>
            <Field label={copy.sellerName}>
              <input
                value={v.sellerName}
                onChange={(e) => patch({ sellerName: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.contactPhone}>
              <input
                value={v.contactPhone}
                onChange={(e) => patch({ contactPhone: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.contactEmail}>
              <input
                value={v.contactEmail}
                onChange={(e) => patch({ contactEmail: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.whatsappNumber}>
              <input
                value={v.whatsappNumber}
                onChange={(e) => patch({ whatsappNumber: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>
      )}

      {isNotice && (
        <Section title={copy.noticeDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.noticeTypeLabel}>
              <select
                value={v.noticeType}
                onChange={(e) => patch({ noticeType: e.target.value })}
                className={inputCls}
              >
                {Object.entries(copy.noticeTypes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={copy.organization}>
              <input
                value={v.organization}
                onChange={(e) => patch({ organization: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.noticeDate}>
              <input
                type="date"
                value={v.noticeDate}
                onChange={(e) => patch({ noticeDate: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.expiryDate}>
              <input
                type="date"
                value={v.noticeExpiry}
                onChange={(e) => patch({ noticeExpiry: e.target.value })}
                className={inputCls}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={v.isOfficial}
                onChange={(e) => patch({ isOfficial: e.target.checked })}
              />
              {copy.isOfficial}
            </label>
          </div>
        </Section>
      )}

      {isCulture && (
        <Section title={copy.eventDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.eventStartsAt}>
              <input
                type="datetime-local"
                value={v.eventStartsAt}
                onChange={(e) => patch({ eventStartsAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.eventEndsAt}>
              <input
                type="datetime-local"
                value={v.eventEndsAt}
                onChange={(e) => patch({ eventEndsAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.venueName}>
              <input
                value={v.venueName}
                onChange={(e) => patch({ venueName: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.ticketUrl}>
              <input
                value={v.ticketUrl}
                onChange={(e) => patch({ ticketUrl: e.target.value })}
                className={inputCls}
                placeholder="https://"
              />
            </Field>
            <Field label={copy.organizerName}>
              <input
                value={v.organizerName}
                onChange={(e) => patch({ organizerName: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.organizerPhone}>
              <input
                value={v.organizerPhone}
                onChange={(e) => patch({ organizerPhone: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.organizerEmail}>
              <input
                value={v.organizerEmail}
                onChange={(e) => patch({ organizerEmail: e.target.value })}
                className={inputCls}
                placeholder="name@example.com"
              />
            </Field>
          </div>
        </Section>
      )}

      {/* 6 — SEO & sharing: permalink, meta descriptions, WhatsApp line. */}
      <Section title={copy.sectionSeo}>
        <Field label={copy.slugLabel} hint={copy.slugHint}>
          <input
            value={v.slug}
            onChange={(e) => {
              // Claiming the slug stops the title from re-deriving it; the
              // auto-fill only ever fills a slug nobody has touched.
              markTouched("slug");
              patch({ slug: e.target.value });
            }}
            className={inputCls}
            placeholder={isEdit ? undefined : "my-story-slug"}
          />
        </Field>
        <BilingualSeo
          copy={copy}
          enSeo={v.enSeo}
          frSeo={v.frSeo}
          onSeo={(locale, val) =>
            patch(locale === "en" ? { enSeo: val } : { frSeo: val })
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.shareTextLabel} hint={copy.shareTextHint}>
            <input
              value={v.shareText}
              onChange={(e) => patch({ shareText: e.target.value })}
              maxLength={280}
              className={inputCls}
            />
          </Field>
          <Field label={copy.voiceLabel}>
            <select
              value={v.voiceType}
              onChange={(e) => patch({ voiceType: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="formal">formal</option>
              <option value="pidgin">pidgin</option>
              <option value="camfranglais">camfranglais</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* 6b — P5 Distribution: one story → every surface (apply-on-tap). */}
      <Section title={copy.repurposeTitle as string}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRepurpose()}
            disabled={!aiEnabled || repurposeWorking}
            className={btnSecondary}
            title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
          >
            {repurposeWorking ? (copy.repurposeWorking as string) : (copy.repurposeRun as string)}
          </button>
        </div>
        {repurpose ? (
          <div className="grid gap-2">
            {(
              [
                ["whatsapp", copy.repurposeWhatsapp],
                ["social", copy.repurposeSocial],
                ["micro", copy.repurposeMicro],
                ["pidgin", copy.repurposePidgin],
                ["emailSubject", copy.repurposeSubject],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-md border border-border bg-muted/40 p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label as string}</p>
                <p className="mt-1 text-sm">{repurpose[key]}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      void navigator.clipboard?.writeText(repurpose[key]);
                      addToast(copy.repurposeCopy as string, "success");
                    }}
                  >
                    {copy.repurposeCopy as string}
                  </button>
                  {key === "whatsapp" || key === "pidgin" ? (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        patch({ shareText: repurpose[key].slice(0, 280) });
                        addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · repurpose)`, "success");
                      }}
                    >
                      {copy.repurposeApplyShare as string}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {/* 7 — Publishing: modes/schedule for create; dates for edit. */}
      <Section title={copy.sectionPublishing}>
        {isEdit && data ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.publishedAtLabel} hint={copy.publishedAtHint}>
              <input
                type="datetime-local"
                value={v.publishedAt}
                onChange={(e) => patch({ publishedAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={`${copy.expiresAt} (${copy.optional})`}>
              <input
                type="date"
                value={v.expiresAt}
                onChange={(e) => patch({ expiresAt: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 rounded-md border border-border bg-background p-3">
            <div role="radiogroup" aria-label={copy.publish} className="flex flex-wrap gap-2">
              {(["now", "schedule", "draft"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={v.publish === mode}
                  onClick={() => patch({ publish: mode })}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                    v.publish === mode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "now"
                    ? copy.publishNow
                    : mode === "schedule"
                      ? copy.publishSchedule
                      : copy.publishDraft}
                </button>
              ))}
            </div>
            {v.publish === "schedule" && (
              <Field label={copy.scheduledFor}>
                <input
                  type="datetime-local"
                  value={v.scheduledFor}
                  onChange={(e) => patch({ scheduledFor: e.target.value })}
                  required
                  className={inputCls}
                />
              </Field>
            )}
            <Field label={`${copy.expiresAt} (${copy.optional})`}>
              <input
                type="date"
                value={v.expiresAt}
                onChange={(e) => patch({ expiresAt: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        )}
        {needsReadiness && <PublishReadiness copy={copy} checks={readinessChecks} />}
      </Section>

          {children}
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

      <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-1 border-t border-border bg-popover px-6 pb-6 pt-3">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex items-center gap-2" aria-live="polite">
            {loading ? (
              <span className="text-xs text-muted-foreground">{common.working}</span>
            ) : dirty ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                <span className="text-xs text-muted-foreground">{common.dirty}</span>
              </>
            ) : isEdit ? (
              <span className="text-xs text-muted-foreground">{common.dockSaved}</span>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            {dirty && (
              <button type="button" onClick={reset} disabled={loading} className={btnGhost}>
                {common.discard}
              </button>
            )}
            <button type="button" onClick={onDone} className={btnSecondary} disabled={loading}>
              {common.cancel}
            </button>
            <button
              type="submit"
              className={btnPrimary}
              disabled={
                loading ||
                !v.enTitle.trim() ||
                (needsReadiness && readinessChecks.some((c) => !c.passed))
              }
              title={common.shortcutsHint}
            >
              {loading
                ? common.working
                : isEdit
                  ? copy.saveChanges
                  : v.publish === "now"
                    ? isApprove
                      ? copy.approvePublish
                      : copy.createPublish
                    : v.publish === "schedule"
                      ? isApprove
                        ? copy.approveSchedule
                        : copy.createSchedule
                      : isApprove
                        ? copy.approveDraft
                        : copy.createDraft}
            </button>
          </span>
        </div>
      </DialogFooter>
    </form>
  );
}







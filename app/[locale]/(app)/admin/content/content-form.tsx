"use client";
/* eslint-disable react-hooks/set-state-in-effect -- debounced author search mirrors the existing dialogs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createContentItem,
  saveContentItem,
  searchAuthors,
} from "@/lib/admin/actions/content";
import { draftShareInto } from "@/components/admin/share-drafter";
import {
  useContentTranslator,
  TranslateButtons,
} from "@/components/admin/translate-buttons";
import { ContentAssistButtons } from "@/components/admin/content-assist-buttons";
import { StoryBlocksEditor } from "@/components/admin/story-blocks-editor";
import type { StoryBlocksCopy } from "@/components/admin/story-blocks-editor";
import {
  draftRemainingFields,
  suggestAltFromCaption,
  suggestCategory,
  suggestCredit,
  suggestExcerpt,
  suggestLocation,
  suggestSeoDescription,
  suggestSlug,
  suggestTags,
  type AutoFillField,
} from "@/lib/content/auto-fill";
import { mergeStoryBlocksIntoBody } from "@/lib/content/blocks";
import {
  clearDraft,
  draftKey,
  isDraftWorthRestoring,
  readDraft,
  writeDraft,
} from "@/lib/content/draft-autosave";
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

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];
type TypeFilters = Dictionary["admin"]["typeFilters"];
type Option = { id: string; name: string; slug?: string };

// Phase 4 — 'micro_story' is the Eye on the Street one-photo format
// (Differentiator #8); it shares the news detail template + categories.
const CONTENT_TYPES = [
  "photo_story",
  "news",
  "listing",
  "notice",
  "culture",
  "micro_story",
] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

// The dictionary labels are camelCase; the DB values are snake_case. Without
// this map the type select silently falls back to raw values (photo_story…).
const TYPE_DICT_KEYS: Record<ContentType, keyof TypeFilters> = {
  photo_story: "photoStory",
  news: "news",
  listing: "listings",
  notice: "notices",
  culture: "culture",
  micro_story: "microStory",
};

const inputCls = ui.input;
const btnPrimary = ui.btnPrimary;
const btnSecondary = ui.btnSecondary;
const btnGhost = ui.btnGhost;

/** One attachment URL per line, optional " - caption" suffix. */
function attachmentList(raw: string, kind: "video" | "audio" | "document") {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, ...rest] = line.split(/\s+-\s+/);
      return { url, kind, caption: rest.join(" - ") || undefined };
    });
}

/** Shared StoryBlocksEditor copy mapping (was duplicated per dialog). */
function storyBlocksCopy(copy: Copy): StoryBlocksCopy {
  return {
    sectionTitle: copy.blocksTitle,
    sectionHint: copy.blocksHint,
    addBlock: copy.blocksAdd,
    addTextSection: copy.blocksAddText,
    addImageSection: copy.blocksAddImage,
    addVideoSection: copy.blocksAddVideo,
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
  };
}

/** Shared MediaUploader copy mapping (was duplicated per dialog). */
function mediaUploaderCopy(common: CommonCopy, copy: Copy) {
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
function Section({
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

/** Listing extension row shared by create + save payloads. */
function typeListing(v: FormValues) {
  return {
    price: v.price ? Number(v.price) : null,
    currency: v.currency || "XAF",
    contactPhone: v.contactPhone.trim() || null,
    contactEmail: v.contactEmail.trim() || null,
    whatsappNumber: v.whatsappNumber.trim() || null,
    sellerName: v.sellerName.trim() || null,
  };
}

/** Notice extension row. Create falls back to the global expiry date. */
function typeNotice(v: FormValues, expiryFallback: boolean) {
  return {
    noticeType: v.noticeType,
    organizationName: v.organization.trim() || null,
    contactPhone: v.contactPhone.trim() || null,
    isOfficial: v.verification === "official_source" || v.isOfficial,
    noticeDate: v.noticeDate ? new Date(v.noticeDate).toISOString() : null,
    expiryDate: v.noticeExpiry
      ? new Date(v.noticeExpiry).toISOString()
      : expiryFallback && v.expiresAt
        ? new Date(v.expiresAt).toISOString()
        : null,
  };
}

/** Culture/event extension row shared by create + save payloads. */
function typeEvent(v: FormValues) {
  return {
    startsAt: v.eventStartsAt
      ? new Date(v.eventStartsAt).toISOString()
      : null,
    endsAt: v.eventEndsAt ? new Date(v.eventEndsAt).toISOString() : null,
    venueName: v.venueName.trim() || null,
    ticketUrl: v.ticketUrl.trim() || null,
    organizerName: v.organizerName.trim() || null,
    organizerPhone: v.organizerPhone.trim() || null,
    organizerEmail: v.organizerEmail.trim() || null,
  };
}

/** One grouped state object replaces ~40 individual useState hooks. */
export type FormValues = {
  type: ContentType;
  publish: "now" | "schedule" | "draft";
  scheduledFor: string;
  expiresAt: string;
  /** Edit only: empty input keeps the stored publish date. */
  publishedAt: string;
  slug: string;
  tags: string;
  byline: string;
  shareText: string;
  voiceType: string;
  enTitle: string;
  frTitle: string;
  enExcerpt: string;
  frExcerpt: string;
  enBody: string;
  frBody: string;
  enSeo: string;
  frSeo: string;
  credit: string;
  verification: string;
  locationId: string;
  categoryId: string;
  videos: string;
  audios: string;
  documents: string;
  newPhotos: UploadedPhoto[];
  /** Edit only: ids of existing photos kept on save. */
  keepIds: string[];
  authorId: string | null;
  authorName: string;
  noticeType: string;
  organization: string;
  noticeDate: string;
  noticeExpiry: string;
  isOfficial: boolean;
  price: string;
  currency: string;
  sellerName: string;
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  eventStartsAt: string;
  eventEndsAt: string;
  venueName: string;
  ticketUrl: string;
  organizerName: string;
  organizerPhone: string;
  organizerEmail: string;
};

/** Row → form values. Create mode calls it with no row (blank form). */
export function formFromRow(
  data?: NonNullable<ContentEditData>,
): FormValues {
  return {
    type: data?.type ?? "news",
    publish: "now",
    scheduledFor: "",
    expiresAt: data?.expiresAt ? data.expiresAt.slice(0, 10) : "",
    publishedAt: data?.publishedAt ? data.publishedAt.slice(0, 16) : "",
    slug: data?.slug ?? "",
    tags: data
      ? data.tags.map((t) => t.name).filter(Boolean).join(", ")
      : "",
    byline: data?.byline ?? "",
    shareText: data?.shareText ?? "",
    voiceType: data?.voiceType ?? "",
    enTitle: data?.enTitle ?? "",
    frTitle: data?.frTitle ?? "",
    enExcerpt: data?.enExcerpt ?? "",
    frExcerpt: data?.frExcerpt ?? "",
    enBody: data?.enBody ?? "",
    frBody: data?.frBody ?? "",
    enSeo: data?.enSeoDescription ?? "",
    frSeo: data?.frSeoDescription ?? "",
    credit: "",
    verification: data?.verification ?? "community_submission",
    locationId: data?.locationId ?? "",
    categoryId: data?.categoryId ?? "",
    videos: "",
    audios: "",
    documents: "",
    newPhotos: [],
    keepIds: data ? data.photos.map((p) => p.id) : [],
    authorId: data?.authorId ?? null,
    authorName: data?.authorName ?? "",
    noticeType: data?.notice?.noticeType ?? "other",
    organization: data?.notice?.organizationName ?? "",
    noticeDate: data?.notice?.noticeDate
      ? data.notice.noticeDate.slice(0, 10)
      : "",
    noticeExpiry: data?.notice?.expiryDate
      ? data.notice.expiryDate.slice(0, 10)
      : "",
    isOfficial: data?.notice?.isOfficial ?? false,
    price: data?.listing?.price != null ? String(data.listing.price) : "",
    currency: data?.listing?.currency ?? "XAF",
    sellerName: data?.listing?.sellerName ?? "",
    contactPhone: data?.listing?.contactPhone ?? "",
    contactEmail: data?.listing?.contactEmail ?? "",
    whatsappNumber: data?.listing?.whatsappNumber ?? "",
    eventStartsAt: data?.event?.startsAt
      ? data.event.startsAt.slice(0, 16)
      : "",
    eventEndsAt: data?.event?.endsAt ? data.event.endsAt.slice(0, 16) : "",
    venueName: data?.event?.venueName ?? "",
    ticketUrl: data?.event?.ticketUrl ?? "",
    organizerName: data?.event?.organizerName ?? "",
    organizerPhone: data?.event?.organizerPhone ?? "",
    organizerEmail: data?.event?.organizerEmail ?? "",
  };
}

/**
 * Grouped form state shared by create + edit. Returns the values object and
 * a partial `patch` updater so the 40+ fields stay in one useState.
 * `baseline` is the serialized form the dialog opened with — the sticky dock
 * compares it against the current values to show the unsaved-changes state.
 *
 * `markTouched` records the derived fields the editor typed into by hand. The
 * auto-fill pass never overwrites a touched field, which is what makes it
 * honest to run repeatedly: the boring fields are derived, so they re-derive —
 * but only while nobody has claimed one.
 */
export function useContentForm(data?: NonNullable<ContentEditData>) {
  const [values, setValues] = useState<FormValues>(() => formFromRow(data));
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(formFromRow(data)));
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  // Stable identity so the memoized field/media/section subtrees below can
  // actually skip their re-render: with `setValues` being the only dependency,
  // `patch` is created once and never changes.
  const patch = useCallback((p: Partial<FormValues>) => {
    setValues((prev) => ({ ...prev, ...p }));
  }, []);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
  }, []);
  const reset = () => {
    const next = formFromRow(data);
    setValues(next);
    setBaseline(JSON.stringify(next));
    setTouched(new Set());
  };
  const dirty = baseline !== JSON.stringify(values);
  return { values, patch, reset, setValues, dirty, touched, markTouched };
}

/**
 * Debounced local autosave for an unsaved form (see lib/content/draft-autosave).
 *
 * Returns the banner state plus restore/discard actions. A draft is offered,
 * never applied, and writing is skipped until the first change after mount —
 * otherwise merely opening a post would create a "newer" draft that shadows the
 * saved row on next open.
 */
function useDraftAutosave(opts: {
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

type StoredDraftView = { savedAt: number; values: FormValues };


export type SavePayload = Parameters<typeof saveContentItem>[1];
export type CreatePayload = Parameters<typeof createContentItem>[0];

export type FormPayload =
  | { kind: "save"; contentItemId: string; draft: SavePayload }
  | { kind: "create"; input: CreatePayload };

/**
 * Human "saved 12 min ago" for the draft-recovery banner. The copy is
 * dictionary-driven so the phrasing is localised rather than assembled here.
 */
function formatDraftAge(
  savedAtMs: number,
  copy: Copy,
  now = Date.now(),
): string {
  const mins = Math.max(0, Math.round((now - savedAtMs) / 60000));
  if (mins < 1) return copy.draftSavedAgo;
  if (mins < 60) return copy.draftSavedMinutesAgo.replace("{n}", String(mins));
  const hours = Math.round(mins / 60);
  if (hours < 24) return copy.draftSavedHoursAgo.replace("{n}", String(hours));
  return copy.draftSavedDaysAgo.replace("{n}", String(Math.round(hours / 24)));
}

/**
 * Form values → server-action payload. Byte-compatible with the payloads the
 * old create/edit dialogs sent to `createContentItem` / `saveContentItem`
 * (same keys, same null/undefined keep-vs-clear semantics). Callers validate
 * first (price numeric, schedule date present) and toast on the result.
 */
export function payloadFromForm(
  v: FormValues,
  data: NonNullable<ContentEditData> | null,
): FormPayload {
  const type = data ? data.type : v.type;
  const isListing = type === "listing";
  const isNotice = type === "notice";
  const isCulture = type === "culture";

  if (data) {
    // ---- save existing item (payload mirrors the old ContentEditForm) ----
    const draft: SavePayload = {
      slugBase: v.enTitle.trim() || data.slug || data.type,
      // Permalink: empty input falls back to the stored slug (never cleared).
      slug: v.slug.trim() || data.slug || undefined,
      // Publish date: empty input leaves the stored value untouched.
      publishedAt: v.publishedAt
        ? new Date(v.publishedAt).toISOString()
        : undefined,
      // Expiry: empty input clears a previously set expiry.
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      verification: (v.verification || null) as never,
      locationId: v.locationId || null,
      categoryId: v.categoryId || null,
      authorId: v.authorId || null,
      photographerCredit: v.credit.trim() || null,
      // Share text + voice fan out to both locale rows — but only when the
      // editor touched them (undefined = keep stored, so opening the drawer
      // never wipes an existing share line).
      translations: [
        {
          locale: "en",
          title: v.enTitle,
          excerpt: v.enExcerpt,
          body: v.enBody,
          seoDescription: v.enSeo,
          byline: v.byline,
          shareText:
            v.shareText !== (data.shareText ?? "")
              ? v.shareText.trim().slice(0, 280) || null
              : undefined,
          voiceType:
            v.voiceType !== (data.voiceType ?? "")
              ? ((v.voiceType || null) as
                  | "formal"
                  | "pidgin"
                  | "camfranglais"
                  | null)
              : undefined,
        },
        {
          locale: "fr",
          title: v.frTitle,
          excerpt: v.frExcerpt,
          body: v.frBody,
          seoDescription: v.frSeo,
          byline: v.byline,
          shareText:
            v.shareText !== (data.shareText ?? "")
              ? v.shareText.trim().slice(0, 280) || null
              : undefined,
          voiceType:
            v.voiceType !== (data.voiceType ?? "")
              ? ((v.voiceType || null) as
                  | "formal"
                  | "pidgin"
                  | "camfranglais"
                  | null)
              : undefined,
        },
      ],
      tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
      photos: v.newPhotos.map((p) => ({
        url: p.url,
        alt: p.alt,
        caption: p.caption,
        credit: p.credit,
        assetId: p.assetId,
        kind: p.kind,
        mimeType: p.mimeType,
        durationSeconds: p.durationSeconds,
      })),
      keepPhotoIds: v.keepIds,
      attachments: [
        ...attachmentList(v.videos, "video"),
        ...attachmentList(v.audios, "audio"),
        ...attachmentList(v.documents, "document"),
      ],
    };
    if (isListing) draft.listing = typeListing(v);
    if (isNotice) draft.notice = typeNotice(v, false);
    if (isCulture) draft.event = typeEvent(v);
    return { kind: "save", contentItemId: data.id, draft };
  }

  // ---- create new item (payload mirrors the old ContentCreateDialog) ----
  const draft: CreatePayload["draft"] = {
    slugBase: v.enTitle.trim() || type,
    slug: v.slug.trim() || undefined,
    verification: (v.verification || null) as never,
    locationId: v.locationId || null,
    categoryId: v.categoryId || null,
    authorId: v.authorId || null,
    photographerCredit: v.credit.trim() || null,
    translations: [
      {
        locale: "en",
        title: v.enTitle,
        excerpt: v.enExcerpt,
        body: v.enBody,
        seoDescription: v.enSeo.trim() || null,
        byline: v.byline.trim() || null,
        shareText: v.shareText.trim().slice(0, 280) || undefined,
        voiceType: (v.voiceType || undefined) as
          | "formal"
          | "pidgin"
          | "camfranglais"
          | undefined,
      },
      {
        locale: "fr",
        title: v.frTitle,
        excerpt: v.frExcerpt,
        body: v.frBody,
        seoDescription: v.frSeo.trim() || null,
        byline: v.byline.trim() || null,
        shareText: v.shareText.trim().slice(0, 280) || undefined,
        voiceType: (v.voiceType || undefined) as
          | "formal"
          | "pidgin"
          | "camfranglais"
          | undefined,
      },
    ],
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    // assetId/kind/mime passthrough lets syncPhotos link the already-stored
    // upload row instead of inserting a duplicate URL-only row (null
    // storage_key, which the DB rejects).
    photos: v.newPhotos.map((p) => ({
      url: p.url,
      alt: p.alt,
      caption: p.caption,
      credit: p.credit,
      assetId: p.assetId,
      kind: p.kind,
      mimeType: p.mimeType,
      durationSeconds: p.durationSeconds,
    })),
    attachments: [
      ...attachmentList(v.videos, "video"),
      ...attachmentList(v.audios, "audio"),
      ...attachmentList(v.documents, "document"),
    ],
  };
  if (type === "listing") draft.listing = typeListing(v);
  if (type === "notice") draft.notice = typeNotice(v, true);
  if (type === "culture") draft.event = typeEvent(v);
  return {
    kind: "create",
    input: {
      type,
      draft,
      publish: v.publish,
      scheduledFor:
        v.publish === "schedule"
          ? new Date(v.scheduledFor).toISOString()
          : undefined,
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
    },
  };
}

export type ContentFormProps = {
  /** create = blank form + publish modes; edit = prefilled, no mode switch. */
  mode: "create" | "edit";
  copy: Copy;
  common: CommonCopy;
  typeFilters: TypeFilters;
  locations: Option[];
  categoriesByType: Record<string, Option[]>;
  /** Edit mode: the loaded row. Create mode: undefined. */
  data?: NonNullable<ContentEditData>;
  /** Edit mode appends a children slot (ContentHistory) above the footer. */
  children?: React.ReactNode;
  /** Editor vs live-preview pane. State lives in the dialog shell (its tabs
   *  render in the sticky header); the form stays mounted either way. */
  tab?: "editor" | "preview";
  /** Called after a successful save (the dialog closes itself). */
  onDone: () => void;
};

/**
 * The single content form behind both admin dialogs. Six labeled sections —
 * Details, Story, Media, Classification, type-specific, SEO, Publishing —
 * replace the two ~500-line duplicated form bodies. Payload construction is
 * byte-compatible with the actions it calls (createContentItem /
 * saveContentItem validate through content-validation.ts).
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
}: ContentFormProps) {
  const { run, loading } = useAdminMutation();
  const { addToast } = useToast();
  const isEdit = mode === "edit" && !!data;
  const locale = useLocaleFromPath();

  const { values: v, patch, dirty, reset, setValues, touched, markTouched } =
    useContentForm(data);

  // Taxonomy options for the current type, shared by the selects and the
  // auto-fill pass. `categoriesByType` is already loaded for the dialog, so
  // drafting a category costs no query.
  const categoryOptions = useMemo(
    () => categoriesByType[v.type] ?? [],
    [categoriesByType, v.type],
  );
  const localDraft = useDraftAutosave({
    keyName: draftKey(isEdit && data ? data.id : null),
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
        Boolean(v.newPhotos.find((p) => p.isCover)?.url),
        v.frExcerpt ?? "",
        copy,
      );
  const needsReadiness = !isEdit && v.publish !== "draft";

  // Assist handlers — shared, was duplicated verbatim in both dialogs.
  const assist = {
    onExcerpt: () => {
      // Per-locale drafting: French fields take French prose only.
      const enS = suggestExcerpt(v.enBody);
      const frS = suggestExcerpt(v.frBody);
      if (!enS && !frS) return addToast(copy.translateEmpty, "error");
      patch({
        enExcerpt: v.enExcerpt.trim() ? v.enExcerpt : enS || v.enExcerpt,
        frExcerpt: v.frExcerpt.trim() ? v.frExcerpt : frS || v.frExcerpt,
      });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onSeo: () => {
      const enS = suggestSeoDescription(v.enTitle, v.enExcerpt || v.enBody);
      const frS = v.frTitle || v.frBody ? suggestSeoDescription(v.frTitle, v.frExcerpt || v.frBody) : "";
      if (!enS && !frS) return addToast(copy.translateEmpty, "error");
      patch({
        enSeo: v.enSeo.trim() ? v.enSeo : enS || v.enSeo,
        frSeo: v.frSeo.trim() ? v.frSeo : frS || v.frSeo,
      });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onTags: () => {
      const existing = v.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const s = suggestTags(
        `${v.enTitle} ${v.frTitle}`,
        `${v.enBody} ${v.frBody}`,
        existing,
      );
      if (s.length === 0) {
        addToast(copy.translateEmpty, "error");
        return;
      }
      patch({ tags: [...existing, ...s].join(", ") });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onSlug: () => {
      patch({ slug: suggestSlug(v.enTitle || v.frTitle) });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onShare: () => {
      void draftShareInto({
        title: v.enTitle || v.frTitle,
        excerpt: v.enExcerpt || v.frExcerpt || "",
        voice: v.voiceType || "formal",
        locale: v.frTitle && !v.enTitle ? "fr" : "en",
        enExcerpt: v.enExcerpt,
        enBody: v.enBody,
      }, copy, patch, addToast);
    },    /**
     * One pass over every derived field the editor left empty — the collapse of
     * the five ✨ buttons above. Category / location are included, which is what
     * deletes two of the publish-readiness gates entirely.
     */
    onDraftAll: () => {
      const result = draftRemainingFields({
        type: v.type,
        enTitle: v.enTitle,
        frTitle: v.frTitle,
        enBody: v.enBody,
        frBody: v.frBody,
        enExcerpt: v.enExcerpt,
        frExcerpt: v.frExcerpt,
        enSeo: v.enSeo,
        frSeo: v.frSeo,
        slug: v.slug,
        tags: v.tags,
        shareText: v.shareText,
        categoryId: v.categoryId,
        locationId: v.locationId,
        authorName: v.authorName,
        categories: categoryOptions,
        locations,
        touched: touched as ReadonlySet<AutoFillField>,
      });
      if (result.applied.length === 0) {
        addToast(
          result.unresolved.length > 0 ? copy.assistUnsure : copy.assistNothingToDo,
          result.unresolved.length > 0 ? "error" : "success",
        );
        return;
      }
      patch(result.patch);
      addToast(
        result.unresolved.length > 0
          ? copy.assistUnsure
          : copy.assistDraftedCount.replace("{n}", String(result.applied.length)),
        result.unresolved.length > 0 ? "error" : "success",
      );
    },
    onCategory: () => {
      const s = suggestCategory(v.enTitle || v.frTitle, v.enBody || v.frBody, categoryOptions);
      if (!s) {
        addToast(copy.assistUnsure, "error");
        return;
      }
      patch({ categoryId: s.id });
      markTouched("categoryId");
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onLocation: () => {
      const s = suggestLocation(v.enTitle || v.frTitle, v.enBody || v.frBody, locations);
      if (!s) {
        addToast(copy.assistUnsure, "error");
        return;
      }
      patch({ locationId: s.id });
      markTouched("locationId");
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    /**
     * Fills alt text on every photo that lacks it, and the post credit from the
     * byline. These were the two fields the form collected but never drafted,
     * so an image-first story could publish with blank accessibility metadata.
     */
    onAlt: () => {
      const title = v.enTitle || v.frTitle;
      let changed = 0;
      const newPhotos = v.newPhotos.map((p) => {
        if (p.alt?.trim() || p.kind === "video" || p.kind === "audio") return p;
        const alt = suggestAltFromCaption(p.caption, title, p.url);
        if (!alt) return p;
        changed += 1;
        return { ...p, alt };
      });
      const credit = v.credit.trim() ? v.credit : suggestCredit("", v.authorName || v.byline);
      if (changed === 0 && credit === v.credit.trim()) {
        addToast(copy.assistNothingToDo, "success");
        return;
      }
      patch({ newPhotos, ...(credit !== v.credit.trim() ? { credit } : {}) });
      addToast(copy.assistDraftedCount.replace("{n}", String(changed || 1)), "success");
    },
  };

  /**
   * Derived fields re-derive while untouched. The two fields an editor actually
   * writes are the title and the body; everything else is a byproduct, so it
   * should follow them instead of waiting for a button press. `touched` is what
   * keeps this honest — the moment a field is edited by hand it stops being
   * rewritten, and a create-mode form never overwrites a stored row.
   */
  useEffect(() => {
    if (isEdit) return;
    const title = v.enTitle || v.frTitle;
    if (!title.trim()) return;
    const t = setTimeout(() => {
      const result = draftRemainingFields({
        type: v.type,
        enTitle: v.enTitle,
        frTitle: v.frTitle,
        enBody: v.enBody,
        frBody: v.frBody,
        enExcerpt: v.enExcerpt,
        frExcerpt: v.frExcerpt,
        enSeo: v.enSeo,
        frSeo: v.frSeo,
        slug: v.slug,
        tags: v.tags,
        shareText: v.shareText,
        categoryId: v.categoryId,
        locationId: v.locationId,
        authorName: v.authorName,
        categories: categoryOptions,
        locations,
        touched: touched as ReadonlySet<AutoFillField>,
      });
      if (result.applied.length > 0) patch(result.patch);
    }, 400);
    return () => clearTimeout(t);
    // Intentionally not re-running on every value it reads: `patch` above
    // changes `v`, which would loop. It keys on the two source fields plus the
    // taxonomy list, which is everything a suggestion can legitimately depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.enTitle, v.frTitle, v.enBody, v.frBody, v.type, categoryOptions, locations, touched, isEdit]);

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
        () => saveContentItem(payload.contentItemId, payload.draft),
        copy.toastUpdated ?? "Saved.",
      );
      // The row now holds everything the autosave held, so the local copy is
      // stale by definition — leaving it would offer it back on next open.
      if (ok) clearDraft(draftKey(payload.contentItemId));
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
            isCover: false,
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
        {!isEdit && (
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
        )}
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
        <ContentAssistButtons copy={copy} {...assist} />
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
                  // FR-13: on existing content never auto-append; the editor
                  // inserts explicitly via "Insert sections into body".
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
                    ? copy.createPublish
                    : v.publish === "schedule"
                      ? copy.createSchedule
                      : copy.createDraft}
            </button>
          </span>
        </div>
      </DialogFooter>
    </form>
  );
}







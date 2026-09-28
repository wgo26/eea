'use client'

/**
 * The content form's value model and payload builder.
 *
 * Extracted verbatim from content-form.tsx (which had outgrown the size
 * ratchet in scripts/verify-admin-lib-size.mjs) so a second surface — the
 * moderation approve form — can build the same ContentDraftInput the Content
 * screen does, instead of hand-rolling a payload that silently drifts.
 */
import { useCallback, useState } from 'react'
import type { Dictionary } from '@/lib/i18n'
import type { ContentEditData } from '@/lib/admin/queries'
import type { UploadedPhoto } from '@/components/admin/media-uploader'
import { type saveContentItem, type createContentItem } from '@/lib/admin/actions/content'

type Copy = Dictionary['admin']['content']
type TypeFilters = Dictionary['admin']['typeFilters']

// Phase 4 — 'micro_story' is the Eye on the Street one-photo format
// (Differentiator #8); it shares the news detail template + categories.
export const CONTENT_TYPES = [
  "photo_story",
  "news",
  "listing",
  "notice",
  "culture",
  "micro_story",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// The dictionary labels are camelCase; the DB values are snake_case. Without
// this map the type select silently falls back to raw values (photo_story…).
export const TYPE_DICT_KEYS: Record<ContentType, keyof TypeFilters> = {
  photo_story: "photoStory",
  news: "news",
  listing: "listings",
  notice: "notices",
  culture: "culture",
  micro_story: "microStory",
};

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
    // The credit is stored per media row (media_assets.photographer_credit),
    // not on the post — so the field has to be rebuilt from the photos or it
    // renders blank on every edit. Saving a blank field then wiped the stored
    // credit (payloadFromForm sends `null`), which is why a credit "disappeared"
    // after any unrelated edit. Cover first, then any photo that carries one.
    credit:
      data?.photos.find((p) => p.credit?.trim())?.credit?.trim() ?? "",
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
export function useContentForm(
  data?: NonNullable<ContentEditData>,
  /**
   * Values applied on top of the blank/row state at mount. The moderation
   * approve form passes the submission prefill here, so a reviewer starts from
   * the submitter's text rather than from a wall of empty inputs — and the
   * `baseline` below still measures "dirty" against that starting point, not
   * against an empty form.
   */
  overrides?: Partial<FormValues>,
) {
  const initial = () => ({ ...formFromRow(data), ...overrides });
  const [values, setValues] = useState<FormValues>(initial);
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initial()));
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
    const next = initial();
    setValues(next);
    setBaseline(JSON.stringify(next));
    setTouched(new Set());
  };
  const dirty = baseline !== JSON.stringify(values);
  return { values, patch, reset, setValues, dirty, touched, markTouched };
}

export type SavePayload = Parameters<typeof saveContentItem>[1];
export type CreatePayload = Parameters<typeof createContentItem>[0];

export type FormPayload =
  | { kind: "save"; contentItemId: string; draft: SavePayload }
  | { kind: "create"; input: CreatePayload };

/**
 * Human "saved 12 min ago" for the draft-recovery banner. The copy is
 * dictionary-driven so the phrasing is localised rather than assembled here.
 */
export function formatDraftAge(
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
      slugBase: v.enTitle.trim() || v.frTitle.trim() || data.slug || data.type,
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
    // Either locale can seed the permalink: an English-first fallback left a
    // French-only item slugged from the type name.
    slugBase: v.enTitle.trim() || v.frTitle.trim() || type,
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

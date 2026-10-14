"use client";

import { useCallback, useMemo } from "react";
import {
  MediaUploader,
  CONTENT_MEDIA_ACCEPTS,
} from "@/components/admin/media-uploader";
import type { UploadedPhoto } from "@/components/admin/media-uploader";
import { ui, Field } from "@/lib/admin/ui-constants";
import type { Dictionary } from "@/lib/i18n";
import type { FormValues } from "./values";
import { Section, mediaUploaderCopy } from "./shell";

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];

const inputCls = ui.input;

/**
 * Section 3 — Media: uploads/picks, credit, supporting links. The memo
 * boundary for the media subtree lives here: `MediaUploader` renders one DOM
 * node per photo and the form re-renders on every keystroke of an unrelated
 * field, so these identities stay stable while typing elsewhere.
 */
export function MediaSection(props: {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  copy: Copy;
  common: CommonCopy;
  existingPhotos:
    | { id: string; url: string; alt: string | null; caption: string | null; credit: string | null; isCover: boolean }[]
    | undefined;
  mediaItemId: string | undefined;
}) {
  const { values: v, patch, copy, common, existingPhotos, mediaItemId } = props;
  const mediaCopy = useMemo(() => mediaUploaderCopy(common, copy), [common, copy]);

  // Stable identities for the media subtree's props. `MediaUploader` renders one
  // DOM node per photo, and the form re-renders on every keystroke of an
  // unrelated field; rebuilding these arrays/objects inline defeated any
  // memoization at that boundary, so a 60-photo story reconciled 60 tiles per
  // character typed.
  const onMediaChange = useCallback(
    (next: { keepIds: string[]; newPhotos: UploadedPhoto[] }) =>
      patch({ keepIds: next.keepIds, newPhotos: next.newPhotos }),
    [patch],
  );

  return (
    <Section title={copy.sectionMedia}>
      <MediaUploader
        existingPhotos={existingPhotos}
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
  );
}

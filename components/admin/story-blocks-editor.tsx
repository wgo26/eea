"use client";

import { useRef, useState } from "react";
import {
  createStoryBlock,
  extractYouTubeThumbnail,
  serializeStoryBlocks,
  suggestExcerptFromBlocks,
  type StoryBlock,
} from "@/lib/admin/content-assist";
import { uploadResumable } from "@/lib/uploads/resumable";

export type StoryBlocksCopy = {
  sectionTitle: string;
  sectionHint: string;
  addBlock: string;
  addTextSection: string;
  addImageSection: string;
  addVideoSection: string;
  addGallerySection: string;
  addCtaSection: string;
  addDividerSection: string;
  insertIntoBody: string;
  inserted: string;
  empty: string;
  headingLabel: string;
  headingPlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  imageLabel: string;
  imagePlaceholder: string;
  uploadImage: string;
  altLabel: string;
  captionLabel: string;
  layoutLabel: string;
  layoutTop: string;
  layoutLeft: string;
  layoutRight: string;
  moveUp: string;
  moveDown: string;
  removeBlock: string;
  blockTitle: string;
  pickFromPhotos: string;
  videoUrlLabel: string;
  videoUrlPlaceholder: string;
  videoThumbnailLabel: string;
  galleryImages: string;
  ctaTextLabel: string;
  ctaTextPlaceholder: string;
  ctaLinkLabel: string;
  ctaLinkPlaceholder: string;
  removeImage: string;
};

type Props = {
  copy: StoryBlocksCopy;
  /** Photos already attached in this dialog (cover + uploads) for one-tap pairing. */
  photoUrls: string[];
  onInsert: (html: string) => void;
  onToast: (message: string, kind: "success" | "error") => void;
  /** Optional: called with (excerpt, sectionCount) to preview auto-draft behavior. */
  onExcerptPreview?: (excerpt: string, sectionCount: number) => void;
  /** Optional: called when a new block is added; when it returns true the serialized blocks auto-update the body. */
  onBlockAdded?: () => boolean;
  /** Optional content-item id so direct uploads associate with the item. */
  contentItemId?: string | null;
};

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary";

export function StoryBlocksEditor({ copy, photoUrls, onInsert, onToast, onExcerptPreview, onBlockAdded, contentItemId }: Props) {
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [open, setOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string | null>(null);

  function excerptFor(next: StoryBlock[]): string {
    return suggestExcerptFromBlocks(next);
  }

  function setBlocksAndPreview(next: StoryBlock[]) {
    setBlocks(next);
    onExcerptPreview?.(excerptFor(next), next.length);
  }

  function addBlock(type: StoryBlock["type"]) {
    const block = createStoryBlock({ type });
    const next = [...blocks, block];
    setBlocksAndPreview(next);
    // Automation contract (FR-13): adding a block asks the host whether the
    // main body should update automatically; the host performs the update.
    if (onBlockAdded?.()) {
      onInsert(serializeStoryBlocks(next));
    }
  }

  async function uploadDirect(file: File, blockId: string) {
    setUploadingId(blockId);
    setUploadProgress(0);
    try {
      const { result } = await uploadResumable(file, {
        destination: "admin_asset",
        contentItemId: contentItemId ?? null,
        onProgress: (p) => {
          if (p.totalBytes > 0) setUploadProgress(Math.round((p.uploadedBytes / p.totalBytes) * 100));
        },
      });
      if (!result.url) throw new Error("Upload failed.");
      setBlocksAndPreview(blocks.map((b) => (b.id === blockId ? { ...b, imageUrl: result.url } : b)));
      onToast(copy.inserted, "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Upload failed.", "error");
    } finally {
      setUploadingId(null);
      setUploadProgress(0);
    }
  }

  function patch(id: string, p: Partial<StoryBlock>) {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...p } : b));
    // Auto-derive YouTube thumbnails the moment a recognizable URL lands.
    const target = next.find((b) => b.id === id);
    if (target?.type === "video" && p.videoUrl !== undefined && !target.videoThumbnail) {
      const thumb = extractYouTubeThumbnail(p.videoUrl);
      if (thumb) {
        setBlocksAndPreview(next.map((b) => (b.id === id ? { ...b, videoThumbnail: thumb } : b)));
        return;
      }
    }
    setBlocksAndPreview(next);
  }

  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setBlocksAndPreview(next);
  }

  function removeBlock(id: string) {
    setBlocksAndPreview(blocks.filter((b) => b.id !== id));
  }

  function handleInsert() {
    const html = serializeStoryBlocks(blocks);
    if (!html.trim()) {
      onToast(copy.empty, "error");
      return;
    }
    onInsert(html);
    onToast(copy.inserted, "success");
  }

  return (
    <details
      className="rounded-md border border-border bg-muted/20"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
        {copy.sectionTitle}
      </summary>
      {open ? (
        <div className="grid gap-3 p-3 pt-0">
          <p className="text-xs text-muted-foreground">{copy.sectionHint}</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy.sectionTitle}>
            <button type="button" onClick={() => addBlock("text")} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {copy.addTextSection}
            </button>
            <button type="button" onClick={() => addBlock("image")} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {copy.addImageSection}
            </button>
            <button type="button" onClick={() => addBlock("video")} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {copy.addVideoSection}
            </button>
            <button type="button" onClick={() => addBlock("gallery")} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {copy.addGallerySection}
            </button>
            <button type="button" onClick={() => addBlock("cta")} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {copy.addCtaSection}
            </button>
            <button type="button" onClick={() => addBlock("divider")} className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {copy.addDividerSection}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const target = uploadTargetRef.current;
              e.target.value = "";
              if (file && target) void uploadDirect(file, target);
            }}
          />
          {blocks.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">{copy.empty}</p>
          ) : (
            blocks.map((b, i) => (
              <article key={b.id} className="grid gap-2 rounded-md border border-border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    {copy.blockTitle} {i + 1} · {b.type}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(b.id, -1)}
                      disabled={i === 0}
                      className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                      title={copy.moveUp}
                      aria-label={copy.moveUp}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(b.id, 1)}
                      disabled={i === blocks.length - 1}
                      className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                      title={copy.moveDown}
                      aria-label={copy.moveDown}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(b.id)}
                      className="rounded border border-destructive/40 px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                      title={copy.removeBlock}
                      aria-label={copy.removeBlock}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {b.type !== "divider" ? (
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.headingLabel}</span>
                    <input
                      value={b.heading}
                      onChange={(e) => patch(b.id, { heading: e.target.value })}
                      placeholder={copy.headingPlaceholder}
                      className={inputCls}
                    />
                  </label>
                ) : (
                  <p className="text-xs italic text-muted-foreground">{copy.addDividerSection}</p>
                )}
                {b.type === "video" ? (
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.videoUrlLabel}</span>
                    <input
                      value={b.videoUrl ?? ""}
                      onChange={(e) => patch(b.id, { videoUrl: e.target.value })}
                      placeholder={copy.videoUrlPlaceholder}
                      inputMode="url"
                      className={inputCls}
                    />
                  </label>
                ) : null}
                {b.type === "video" && b.videoUrl ? (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.videoThumbnail || extractYouTubeThumbnail(b.videoUrl) || ""}
                      alt=""
                      className="h-10 w-14 rounded object-cover"
                      loading="lazy"
                    />
                    <span className="text-xs text-muted-foreground">{copy.videoThumbnailLabel}</span>
                  </div>
                ) : null}
                {b.type === "cta" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">{copy.ctaTextLabel}</span>
                      <input
                        value={b.ctaText ?? ""}
                        onChange={(e) => patch(b.id, { ctaText: e.target.value })}
                        placeholder={copy.ctaTextPlaceholder}
                        className={inputCls}
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">{copy.ctaLinkLabel}</span>
                      <input
                        value={b.ctaLink ?? ""}
                        onChange={(e) => patch(b.id, { ctaLink: e.target.value })}
                        placeholder={copy.ctaLinkPlaceholder}
                        inputMode="url"
                        className={inputCls}
                      />
                    </label>
                  </div>
                ) : null}
                {b.type === "gallery" ? (
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.galleryImages}</span>
                    <textarea
                      value={(b.galleryImages ?? []).map((g) => g.url).join("\n")}
                      onChange={(e) =>
                        patch(b.id, {
                          galleryImages: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .map((url) => ({ url })),
                        })
                      }
                      placeholder={copy.imagePlaceholder}
                      rows={3}
                      className={inputCls}
                    />
                  </label>
                ) : null}
                {b.type !== "divider" && b.type !== "gallery" && b.type !== "cta" ? (
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.bodyLabel}</span>
                    <textarea
                      value={b.body}
                      onChange={(e) => patch(b.id, { body: e.target.value })}
                      placeholder={copy.bodyPlaceholder}
                      rows={3}
                      className={inputCls}
                    />
                  </label>
                ) : null}
                {b.type === "cta" ? (
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.bodyLabel}</span>
                    <textarea
                      value={b.body}
                      onChange={(e) => patch(b.id, { body: e.target.value })}
                      placeholder={copy.bodyPlaceholder}
                      rows={2}
                      className={inputCls}
                    />
                  </label>
                ) : null}
                {b.type === "image" || b.type === "text" ? (
                  <>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">{copy.imageLabel}</span>
                      <div className="flex gap-2">
                        <input
                          value={b.imageUrl}
                          onChange={(e) => patch(b.id, { imageUrl: e.target.value })}
                          placeholder={copy.imagePlaceholder}
                          inputMode="url"
                          className={inputCls}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            uploadTargetRef.current = b.id;
                            fileInputRef.current?.click();
                          }}
                          disabled={uploadingId === b.id}
                          className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {uploadingId === b.id ? `${uploadProgress}%` : copy.uploadImage}
                        </button>
                      </div>
                    </label>
                    {b.imageUrl ? (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.imageUrl} alt={b.imageAlt || ""} className="h-12 w-16 rounded object-cover" loading="lazy" />
                        <button
                          type="button"
                          onClick={() => patch(b.id, { imageUrl: "" })}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {copy.removeImage}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {b.type === "image" && photoUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="w-full text-xs text-muted-foreground">{copy.pickFromPhotos}</span>
                    {photoUrls.slice(0, 8).map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => patch(b.id, { imageUrl: url })}
                        className={`overflow-hidden rounded border-2 transition-colors ${
                          b.imageUrl === url ? "border-primary" : "border-border hover:border-muted-foreground"
                        }`}
                        title={url}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-10 w-14 object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {(b.type === "image" || b.type === "text") && b.imageUrl ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.altLabel}</span>
                    <input
                      value={b.imageAlt}
                      onChange={(e) => patch(b.id, { imageAlt: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{copy.captionLabel}</span>
                    <input
                      value={b.imageCaption}
                      onChange={(e) => patch(b.id, { imageCaption: e.target.value })}
                      className={inputCls}
                    />
                  </label>
                </div>
                ) : null}
                {b.type === "image" ? (
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{copy.layoutLabel}</span>
                  <select
                    value={b.layout}
                    onChange={(e) => patch(b.id, { layout: e.target.value as StoryBlock["layout"] })}
                    className={inputCls}
                  >
                    <option value="image-top">{copy.layoutTop}</option>
                    <option value="image-left">{copy.layoutLeft}</option>
                    <option value="image-right">{copy.layoutRight}</option>
                  </select>
                </label>
                ) : null}
              </article>
            ))
          )}
          <div className="flex flex-wrap gap-2">
            {blocks.length > 0 ? (
              <button
                type="button"
                onClick={handleInsert}
                className="inline-flex items-center rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                {copy.insertIntoBody}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </details>
  );
}

"use client";

import { useState } from "react";
import {
  createStoryBlock,
  serializeStoryBlocks,
  type StoryBlock,
} from "@/lib/admin/content-assist";

export type StoryBlocksCopy = {
  sectionTitle: string;
  sectionHint: string;
  addBlock: string;
  insertIntoBody: string;
  inserted: string;
  empty: string;
  headingLabel: string;
  headingPlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  imageLabel: string;
  imagePlaceholder: string;
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
};

type Props = {
  copy: StoryBlocksCopy;
  /** Photos already attached in this dialog (cover + uploads) for one-tap pairing. */
  photoUrls: string[];
  onInsert: (html: string) => void;
  onToast: (message: string, kind: "success" | "error") => void;
};

const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary";

export function StoryBlocksEditor({ copy, photoUrls, onInsert, onToast }: Props) {
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [open, setOpen] = useState(false);

  function patch(id: string, p: Partial<StoryBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)));
  }

  function move(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
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
          {blocks.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">{copy.empty}</p>
          ) : (
            blocks.map((b, i) => (
              <article key={b.id} className="grid gap-2 rounded-md border border-border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    {copy.blockTitle} {i + 1}
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
                      onClick={() => setBlocks((prev) => prev.filter((x) => x.id !== b.id))}
                      className="rounded border border-destructive/40 px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                      title={copy.removeBlock}
                      aria-label={copy.removeBlock}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{copy.headingLabel}</span>
                  <input
                    value={b.heading}
                    onChange={(e) => patch(b.id, { heading: e.target.value })}
                    placeholder={copy.headingPlaceholder}
                    className={inputCls}
                  />
                </label>
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
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{copy.imageLabel}</span>
                  <input
                    value={b.imageUrl}
                    onChange={(e) => patch(b.id, { imageUrl: e.target.value })}
                    placeholder={copy.imagePlaceholder}
                    inputMode="url"
                    className={inputCls}
                  />
                </label>
                {photoUrls.length > 0 ? (
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
              </article>
            ))
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBlocks((prev) => [...prev, createStoryBlock()])}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {copy.addBlock}
            </button>
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

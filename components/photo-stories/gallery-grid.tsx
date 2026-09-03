"use client";

import { useState } from "react";
import { Expand, Images, MousePointerClick } from "lucide-react";

import { GalleryLightbox } from "@/components/photo-stories/gallery-lightbox";
import type { Dictionary } from "@/lib/i18n";
import type { PhotoStoryPhoto } from "@/lib/queries/photo-stories";

type GalleryGridProps = {
    photos: PhotoStoryPhoto[];
    storyTitle: string;
    dict: Dictionary;
};

/** Aspect-ratio-aware tile: uses natural dimensions to prevent layout shift. */
function masonryStyle(photo: PhotoStoryPhoto): React.CSSProperties | undefined {
    if (photo.width && photo.height) {
        return { aspectRatio: `${photo.width} / ${photo.height}` };
    }
    return undefined;
}

/**
 * Photo essay gallery (spec §3.2): the cover photograph leads as a
 * full-width feature, the rest of the essay flows in a masonry column
 * layout that reflows as images load. Captions and per-photo credits sit
 * under every frame (Differentiator #3); clicking any photo opens the
 * lightbox.
 */
export function GalleryGrid({ photos, storyTitle, dict }: GalleryGridProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    if (photos.length === 0) {
        return (
            <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                {dict.photoStories.comingSoon}
            </p>
        );
    }

    const [cover, ...rest] = photos;

    return (
        <>
            {/* Cover feature */}
            <figure className="mb-4">
                <button
                    type="button"
                    onClick={() => setOpenIndex(0)}
                    aria-label={`${dict.photoStories.openPhoto} 1`}
                    className="group relative block w-full overflow-hidden rounded-3xl bg-muted"
                >
                    <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9] md:aspect-[21/9]">
                        {/* Remote storage URLs are not in next/image domains,
                            so the gallery uses plain img elements. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={cover.url}
                            alt={cover.alt ?? storyTitle}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                        />
                        <span
                            className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10"
                            aria-hidden
                        />
                        <span className="absolute right-4 bottom-4 left-4 flex flex-wrap items-center justify-between gap-2 md:right-6 md:bottom-5 md:left-6">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur">
                                <MousePointerClick className="h-3.5 w-3.5" aria-hidden />
                                {dict.photoStories.scrollStory}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                                <Images className="h-3 w-3" aria-hidden />
                                {photos.length} {dict.photoStories.photosLabel}
                            </span>
                        </span>
                    </div>
                </button>
                {cover.caption || cover.credit ? (
                    <figcaption className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {cover.caption}
                        {cover.caption && cover.credit ? " — " : ""}
                        {cover.credit
                            ? `${dict.photoStories.photographBy} ${cover.credit}`
                            : null}
                    </figcaption>
                ) : null}
            </figure>

            {/* The rest of the essay, masonry */}
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                {rest.map((photo, index) => {
                    const galleryIndex = index + 1;
                    return (
                        <figure key={photo.id} className="mb-4 break-inside-avoid">
                            <button
                                type="button"
                                onClick={() => setOpenIndex(galleryIndex)}
                                aria-label={`${dict.photoStories.openPhoto} ${galleryIndex + 1}`}
                                className="group relative block w-full overflow-hidden rounded-2xl bg-muted"
                                style={masonryStyle(photo)}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photo.url}
                                    alt={photo.alt ?? storyTitle}
                                    loading="lazy"
                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                />
                                <span
                                    className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/25 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-hidden
                                >
                                    <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white">
                                        {galleryIndex + 1} / {photos.length}
                                    </span>
                                    <Expand className="rounded-full bg-black/50 p-1 text-white" />
                                </span>
                            </button>
                            {photo.caption || photo.credit ? (
                                <figcaption className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                    {photo.caption}
                                    {photo.caption && photo.credit ? " — " : ""}
                                    {photo.credit
                                        ? `${dict.photoStories.photographBy} ${photo.credit}`
                                        : null}
                                </figcaption>
                            ) : null}
                        </figure>
                    );
                })}
            </div>

            <GalleryLightbox
                photos={photos}
                storyTitle={storyTitle}
                dict={dict}
                openIndex={openIndex}
                onClose={() => setOpenIndex(null)}
            />
        </>
    );
}
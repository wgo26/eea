"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { Dictionary } from "@/lib/i18n";
import type { PhotoStoryPhoto } from "@/lib/queries/photo-stories";
import { cn } from "@/lib/utils";

type GalleryLightboxProps = {
    photos: PhotoStoryPhoto[];
    storyTitle: string;
    dict: Dictionary;
    /** Controlled by the grid: which photo is open (null = closed). */
    openIndex: number | null;
    onClose: () => void;
};

/** Prev/next arrows need no state — they just report which way to step. */
function StepButton({
    direction,
    dict,
    onStep,
}: {
    direction: "prev" | "next";
    dict: Dictionary;
    onStep: (direction: "prev" | "next") => void;
}) {
    const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={() => onStep(direction)}
            aria-label={
                direction === "prev"
                    ? dict.photoStories.prevPhoto
                    : dict.photoStories.nextPhoto
            }
            className={cn(
                "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20",
                direction === "prev" ? "left-2 md:left-4" : "right-2 md:right-4",
            )}
        >
            <Icon className="h-6 w-6" aria-hidden />
        </button>
    );
}

/** Thumbnail tile in the filmstrip under the stage. */
function Thumbnail({
    photo,
    active,
    label,
    onSelect,
}: {
    photo: PhotoStoryPhoto;
    active: boolean;
    label: string;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-label={label}
            aria-current={active ? "true" : undefined}
            className={cn(
                "relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition-all",
                active
                    ? "ring-primary"
                    : "ring-transparent opacity-60 hover:opacity-100",
            )}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={photo.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
            />
        </button>
    );
}

/**
 * The actual lightbox UI. Mounted with `key={openIndex}` so its index state
 * is seeded fresh for every photo opened (React's recommended reset-state
 * pattern — no effects needed to sync position). Body scroll is locked for
 * the duration (DOM side effects live here, not in render).
 */
function LightboxInner({
    photos,
    storyTitle,
    dict,
    initialIndex,
    onClose,
}: Omit<GalleryLightboxProps, "openIndex"> & { initialIndex: number }) {
    const [index, setIndex] = useState(initialIndex);

    function step(direction: "prev" | "next") {
        setIndex((current) =>
            direction === "prev"
                ? (current - 1 + photos.length) % photos.length
                : (current + 1) % photos.length,
        );
    }

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "ArrowRight") step("next");
            else if (event.key === "ArrowLeft") step("prev");
            else if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
        // step() is recreated each render but only reads stable state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photos.length, onClose]);

    // Lock page scroll while the lightbox is open.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    const safeIndex = Math.min(index, photos.length - 1);
    const photo = photos[safeIndex];

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-black/95"
            role="dialog"
            aria-modal="true"
            aria-label={`${storyTitle} — ${dict.photoStories.gallery}`}
            onClick={(event) => {
                // Backdrop click closes; clicks inside the stage do not.
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="flex items-center justify-between gap-4 p-4">
                <p className="truncate text-sm text-white/70">{storyTitle}</p>
                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums text-white/80">
                    {dict.photoStories.photo} {safeIndex + 1} {dict.photoStories.ofLabel}{" "}
                    {photos.length}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={dict.photoStories.closeGallery}
                    className="shrink-0 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                >
                    <X className="h-5 w-5" aria-hidden />
                </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center px-4 pb-2 md:px-16">
                {photos.length > 1 ? (
                    <StepButton direction="prev" dict={dict} onStep={step} />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    key={safeIndex}
                    src={photo.url}
                    alt={photo.alt ?? storyTitle}
                    className="max-h-full max-w-full animate-in fade-in-0 rounded-lg object-contain"
                />
                {photos.length > 1 ? (
                    <StepButton direction="next" dict={dict} onStep={step} />
                ) : null}
            </div>

            <div className="space-y-1 px-4 pt-1 text-center text-sm text-white/80">
                {photo.caption ? <p>{photo.caption}</p> : null}
                <p className="text-xs text-white/55">
                    {photo.credit ? `${dict.photoStories.photographBy} ${photo.credit}` : ""}
                    {photo.width && photo.height ? ` · ${photo.width} × ${photo.height}` : ""}
                </p>
            </div>

            {photos.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto p-4">
                    {photos.map((thumb, thumbIndex) => (
                        <Thumbnail
                            key={thumb.id}
                            photo={thumb}
                            active={thumbIndex === safeIndex}
                            label={`${dict.photoStories.openPhoto} ${thumbIndex + 1}`}
                            onSelect={() => setIndex(thumbIndex)}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Full-screen lightbox for the photo essay gallery (spec §3.2). Renders
 * nothing when closed; when a photo is opened it mounts LightboxInner keyed
 * by that photo so position resets to exactly it.
 */
export function GalleryLightbox({
    photos,
    storyTitle,
    dict,
    openIndex,
    onClose,
}: GalleryLightboxProps) {
    if (openIndex === null || photos.length === 0) return null;
    return (
        <LightboxInner
            key={openIndex}
            photos={photos}
            storyTitle={storyTitle}
            dict={dict}
            initialIndex={openIndex}
            onClose={onClose}
        />
    );
}
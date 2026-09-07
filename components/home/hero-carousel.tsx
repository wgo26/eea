"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroSlide } from "@/components/home/hero-slide";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

const AUTOPLAY_INTERVAL_MS = 2000;
const FEATURED_LIMIT = 5;

type HeroCarouselProps = {
    stories: StoryCardData[];
    dict: Dictionary;
    locale: Locale;
};

const controlClasses =
    "z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/60";

/**
 * Hero slideshow (spec §1A): loops the featured stories with autoplay,
 * drag/swipe, keyboard arrows and dot navigation. Autoplay pauses on hover or
 * touch, in background tabs and under prefers-reduced-motion; a play/pause
 * button keeps it under the visitor's control.
 */
export function HeroCarousel({ stories, dict, locale }: HeroCarouselProps) {
    const slides = stories.slice(0, FEATURED_LIMIT);
    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: slides.length > 1, duration: 24 });
    const [selected, setSelected] = React.useState(0);
    const [interactive, setInteractive] = React.useState(0);
    const [pointerOver, setPointerOver] = React.useState(false);
    const [userPaused, setUserPaused] = React.useState(false);
    const [reducedMotion, setReducedMotion] = React.useState(false);
    const [pageHidden, setPageHidden] = React.useState(false);

    // Dots/counter follow the target slide immediately…
    React.useEffect(() => {
        if (!emblaApi) return;
        const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);
        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi]);

    // …while focus/interaction only moves once a transition has settled, so a
    // drag gesture is never interrupted by inert toggling mid-drag.
    React.useEffect(() => {
        if (!emblaApi) return;
        const onSettle = () => setInteractive(emblaApi.selectedScrollSnap());
        onSettle();
        emblaApi.on("settle", onSettle);
        emblaApi.on("reInit", onSettle);
        return () => {
            emblaApi.off("settle", onSettle);
            emblaApi.off("reInit", onSettle);
        };
    }, [emblaApi]);

    // Environment pauses: prefers-reduced-motion + background tabs.
    React.useEffect(() => {
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncMotion = () => setReducedMotion(motionQuery.matches);
        const syncVisibility = () => setPageHidden(document.hidden);
        syncMotion();
        syncVisibility();
        motionQuery.addEventListener("change", syncMotion);
        document.addEventListener("visibilitychange", syncVisibility);
        return () => {
            motionQuery.removeEventListener("change", syncMotion);
            document.removeEventListener("visibilitychange", syncVisibility);
        };
    }, []);

    const scrollPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
    const scrollTo = React.useCallback(
        (index: number) => emblaApi?.scrollTo(index),
        [emblaApi]
    );

    const autoPlaying =
        slides.length > 1 && !userPaused && !pointerOver && !reducedMotion && !pageHidden;
    // Rotate the features; `selected` in deps restarts the timer after manual
    // navigation so every slide gets a full dwell time.
    React.useEffect(() => {
        if (!autoPlaying || !emblaApi) return;
        const timer = window.setInterval(() => emblaApi.scrollNext(), AUTOPLAY_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [autoPlaying, emblaApi, selected]);

    // Suppress the ghost click that follows a drag-to-navigate gesture.
    const suppressClick = React.useRef(false);
    React.useEffect(() => {
        if (!emblaApi) return;
        const preventNextClick = () => {
            suppressClick.current = true;
        };
        const onPointerDown = () => {
            emblaApi.on("select", preventNextClick);
        };
        const onPointerUp = () => {
            emblaApi.off("select", preventNextClick);
        };
        emblaApi.on("pointerDown", onPointerDown).on("pointerUp", onPointerUp);
        return () => {
            emblaApi
                .off("pointerDown", onPointerDown)
                .off("pointerUp", onPointerUp)
                .off("select", preventNextClick);
        };
    }, [emblaApi]);
    const onClickCapture = React.useCallback((event: React.MouseEvent) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollPrev();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollNext();
        }
    };

    return (
        <div
            className="relative"
            role="region"
            aria-roledescription="carousel"
            aria-label={dict.hero.featured}
            onPointerEnter={() => setPointerOver(true)}
            onPointerLeave={() => setPointerOver(false)}
            onKeyDown={onKeyDown}
            onClickCapture={onClickCapture}
        >
            <div ref={emblaRef} className="overflow-hidden rounded-3xl">
                <div className="flex">
                    {slides.map((story, index) => (
                        <div
                            key={story.id}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${index + 1} / ${slides.length}`}
                            className="min-w-0 shrink-0 grow-0 basis-full"
                            inert={index !== interactive}
                        >
                            <HeroSlide story={story} dict={dict} locale={locale} />
                        </div>
                    ))}
                </div>
            </div>

            <button
                type="button"
                onClick={scrollPrev}
                aria-label={dict.hero.prev}
                className={cn(controlClasses, "absolute left-3 top-1/2 -translate-y-1/2 md:left-4")}
            >
                <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
                type="button"
                onClick={scrollNext}
                aria-label={dict.hero.next}
                className={cn(controlClasses, "absolute right-3 top-1/2 -translate-y-1/2 md:right-4")}
            >
                <ChevronRight className="h-5 w-5" aria-hidden />
            </button>

            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-3 md:bottom-5 md:right-6">
                <button
                    type="button"
                    onClick={() => setUserPaused((paused) => !paused)}
                    aria-label={userPaused ? dict.hero.play : dict.hero.pause}
                    aria-pressed={userPaused}
                    className={controlClasses}
                >
                    {userPaused ? (
                        <Play className="h-4 w-4" aria-hidden />
                    ) : (
                        <Pause className="h-4 w-4" aria-hidden />
                    )}
                </button>
                <span
                    className="text-xs font-bold tabular-nums text-white/80"
                    aria-live="polite"
                    aria-atomic
                >
                    {selected + 1} / {slides.length}
                </span>
                <div className="flex items-center gap-1.5">
                    {slides.map((story, index) => (
                        <button
                            key={story.id}
                            type="button"
                            onClick={() => scrollTo(index)}
                            aria-label={story.title}
                            aria-current={index === selected ? "true" : undefined}
                            className={cn(
                                "h-1.5 rounded-full transition-all",
                                index === selected
                                    ? "w-6 bg-primary"
                                    : "w-1.5 bg-white/50 hover:bg-white/80"
                            )}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
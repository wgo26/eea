"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroSlide } from "@/components/home/hero-slide";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

const AUTOPLAY_INTERVAL_MS = 6000;
const FEATURED_LIMIT = 5;

type HeroCarouselProps = {
    stories: StoryCardData[];
    dict: Dictionary;
    locale: Locale;
};

const controlClasses =
    "z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur transition-colors hover:bg-black/60";

/**
 * Hero crossfade (spec §1A): the featured stories fade in/out over a fixed
 * dwell instead of sliding sideways. Autoplay pauses on hover/focus or
 * touch, in background tabs and under prefers-reduced-motion; a play/pause
 * button keeps it under the visitor's control.
 *
 * Slides are grid-stacked (all in the same grid cell) so the container keeps
 * its height without measuring — every slide has the same fixed height.
 * Off-screen slides are inert + aria-hidden so keyboard focus and screen
 * readers only ever see the visible story.
 */
export function HeroCarousel({ stories, dict, locale }: HeroCarouselProps) {
    const slides = stories.slice(0, FEATURED_LIMIT);
    const [selected, setSelected] = React.useState(0);
    const [userPaused, setUserPaused] = React.useState(false);
    const [hoverPause, setHoverPause] = React.useState(false);
    const [reducedMotion, setReducedMotion] = React.useState(false);
    const [pageHidden, setPageHidden] = React.useState(false);

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

    const goTo = React.useCallback(
        (index: number) => setSelected(((index % slides.length) + slides.length) % slides.length),
        [slides.length]
    );
    const scrollPrev = React.useCallback(() => goTo(selected - 1), [goTo, selected]);
    const scrollNext = React.useCallback(() => goTo(selected + 1), [goTo, selected]);

    // Basic touch swipe (no drag physics — a fade has nothing to drag).
    const touchStartX = React.useRef<number | null>(null);
    const onTouchStart = (event: React.TouchEvent) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
    };
    const onTouchEnd = (event: React.TouchEvent) => {
        if (touchStartX.current == null) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 40) return;
        if (delta < 0) scrollNext();
        else scrollPrev();
    };

    const autoPlaying =
        slides.length > 1 && !userPaused && !hoverPause && !reducedMotion && !pageHidden;
    // `selected` in deps restarts the dwell after manual navigation so every
    // slide gets its full time on screen.
    React.useEffect(() => {
        if (!autoPlaying) return;
        const timer = window.setInterval(() => {
            setSelected((current) => (current + 1) % slides.length);
        }, AUTOPLAY_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [autoPlaying, selected, slides.length]);

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
            onPointerEnter={() => setHoverPause(true)}
            onPointerLeave={() => setHoverPause(false)}
            onFocus={() => setHoverPause(true)}
            onBlur={() => setHoverPause(false)}
            onKeyDown={onKeyDown}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            <div className="grid overflow-hidden rounded-3xl">
                {slides.map((story, index) => {
                    const active = index === selected;
                    return (
                        <div
                            key={story.id}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${index + 1} / ${slides.length}`}
                            aria-hidden={!active}
                            inert={!active}
                            className={cn(
                                "col-start-1 row-start-1 min-w-0 transition-opacity duration-700 ease-out",
                                active ? "z-[1] opacity-100" : "pointer-events-none z-0 opacity-0",
                                reducedMotion && "transition-none"
                            )}
                        >
                            <HeroSlide story={story} dict={dict} locale={locale} priority={index === 0} />
                        </div>
                    );
                })}
            </div>

            {slides.length > 1 ? (
                <>
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
                                    onClick={() => goTo(index)}
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
                </>
            ) : null}
        </div>
    );
}

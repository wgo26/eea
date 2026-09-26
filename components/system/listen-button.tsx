"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Square } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

type ListenCopy = Dictionary["listen"];

/**
 * "Listen to article" via the built-in Web Speech API (speechSynthesis) —
 * free, offline-capable, no backend. Reads title + excerpt + body text.
 * Hidden when the browser has no speech synthesis support.
 */
export function ListenButton({
    title,
    text,
    locale,
    copy,
}: {
    title: string;
    text: string;
    locale: string;
    copy: ListenCopy;
}) {
    const [supported] = useState(
        () => typeof window !== "undefined" && "speechSynthesis" in window,
    );
    const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
    const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

    useEffect(() => {
        return () => {
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    if (!supported) return null;

    function speak() {
        const synth = window.speechSynthesis;
        synth.cancel();
        // Bodies may arrive as sanitized HTML — strip tags so the voice
        // never reads markup aloud.
        const plain = `${title}. ${text}`.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
        const utter = new SpeechSynthesisUtterance(plain);
        utter.lang = locale.startsWith("fr") ? "fr-FR" : "en-US";
        utter.onend = () => setState("idle");
        utter.onerror = () => setState("idle");
        utterRef.current = utter;
        synth.speak(utter);
        setState("playing");
    }

    function toggle() {
        const synth = window.speechSynthesis;
        if (state === "playing") {
            synth.pause();
            setState("paused");
        } else if (state === "paused") {
            synth.resume();
            setState("playing");
        } else {
            speak();
        }
    }

    function stop() {
        window.speechSynthesis.cancel();
        setState("idle");
    }

    return (
        <span className="inline-flex items-center gap-1.5">
            <button
                type="button"
                onClick={toggle}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                {state === "idle" ? (
                    <>
                        <Headphones className="h-3.5 w-3.5" aria-hidden />
                        {copy.listen}
                    </>
                ) : state === "playing" ? (
                    <>
                        <Pause className="h-3.5 w-3.5" aria-hidden />
                        {copy.pause}
                    </>
                ) : (
                    <>
                        <Play className="h-3.5 w-3.5" aria-hidden />
                        {copy.resume}
                    </>
                )}
            </button>
            {state !== "idle" ? (
                <button
                    type="button"
                    onClick={stop}
                    aria-label={copy.stop}
                    title={copy.stop}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <Square className="h-3.5 w-3.5" aria-hidden />
                </button>
            ) : null}
        </span>
    );
}

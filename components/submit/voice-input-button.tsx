"use client";

import * as React from "react";
import { Mic } from "lucide-react";

declare global {
    interface Window {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    }
}

interface SpeechRecognitionInstance {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

/**
 * P1 low-literacy path: dictation button for submit textareas (Web Speech API).
 * Progressive enhancement — renders nothing where the API is absent (iOS
 * Safari, insecure contexts). Transcript is appended to the target field and
 * input/change events are dispatched so draft-autosave picks it up.
 * Labels are a tiny locale switch until P2 moves them into the dictionaries.
 */
export function VoiceInputButton({
    targetId,
    locale,
}: {
    targetId: string;
    locale: string;
}) {
    // Feature-detect once (client-only component, so window is safe here).
    // No effect needed — the constructor lookup never changes at runtime.
    const [supported] = React.useState(
        () =>
            typeof window !== "undefined" &&
            Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
    );
    const [listening, setListening] = React.useState(false);
    const recRef = React.useRef<SpeechRecognitionInstance | null>(null);

    React.useEffect(() => {
        return () => {
            try {
                recRef.current?.abort();
            } catch {
                /* noop */
            }
        };
    }, []);

    if (!supported) return null;

    const fr = locale === "fr";
    const label = fr ? "Saisie vocale" : "Voice input";
    const listeningLabel = fr ? "Écoute…" : "Listening…";

    const toggle = () => {
        if (listening) {
            try {
                recRef.current?.stop();
            } catch {
                /* noop */
            }
            return;
        }
        const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!Ctor) return;
        const rec = new Ctor();
        recRef.current = rec;
        rec.lang = fr ? "fr-FR" : "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript?.trim();
            if (!transcript) return;
            const el = document.getElementById(targetId);
            if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
                const sep = el.value.trim() ? " " : "";
                el.value = `${el.value}${sep}${transcript}`;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.focus();
            }
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        try {
            rec.start();
            setListening(true);
        } catch {
            setListening(false);
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={label}
            title={label}
            aria-pressed={listening}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent disabled:opacity-50"
        >
            <Mic className="h-4 w-4" aria-hidden />
            <span aria-hidden>{listening ? listeningLabel : label}</span>
        </button>
    );
}

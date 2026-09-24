/**
 * W21 — Pidgin/Camfranglais share-voice measurement.
 *
 * Share taps beacon as aggregate-only analytics surfaces (`share-formal`,
 * `share-pidgin`, `share-camfranglais`) so the admin insights page can show
 * which voice register actually gets shared — without touching the
 * (day, surface, locale, place) schema or the privacy contract (no content
 * ids, no user identity; the voice is a property of the tap, not the reader).
 *
 * Client-safe: no server imports; failures are swallowed (observational).
 */

const VOICES = new Set(["formal", "pidgin", "camfranglais"]);

export type ShareVoice = "formal" | "pidgin" | "camfranglais";

/** Normalize an article voice_type to a beacon voice (null/unknown = formal). */
export function normalizeShareVoice(voice: string | null | undefined): ShareVoice {
    const v = (voice ?? "").trim().toLowerCase();
    return (VOICES.has(v) ? v : "formal") as ShareVoice;
}

/**
 * Resolve the voice of a share tap — or null when it cannot be known
 * honestly. A share with no share line always carries the formal title; an
 * explicit voice register is trusted; a share line with no voice recorded
 * is ambiguous and must NOT be guessed (it would corrupt the measurement).
 */
export function resolveShareVoice(
    shareText: string | null | undefined,
    voiceType: string | null | undefined,
): ShareVoice | null {
    if (!shareText?.trim()) return "formal";
    if (voiceType === undefined || voiceType === null) return null;
    const v = voiceType.trim().toLowerCase();
    if (VOICES.has(v)) return v as ShareVoice;
    if (v === "formal") return "formal";
    return null;
}

/** Aggregate surface for a share tap in the given voice. */
export function shareVoiceSurface(voice: ShareVoice): string {
    return `share-${voice}`;
}

/** Fire-and-forget share-tap beacon for W13 insights. Never throws. */
export function beaconShareTap(voice: ShareVoice | null, locale: string): void {
    if (!voice) return;
    try {
        void fetch("/api/analytics/event", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                surface: shareVoiceSurface(voice),
                locale: locale === "fr" ? "fr" : "en",
                place: "",
            }),
            keepalive: true,
            credentials: "omit",
        }).catch(() => {
            /* observational */
        });
    } catch {
        /* observational */
    }
}

/**
 * Per-content share beacon — bumps `content_items.share_count` AND the
 * aggregate `share-{voice}` surface in one POST, so the public ">10 shares"
 * proof and the admin voice breakdown stay in sync. When no content id is
 * known (legacy callers), falls back to the aggregate-only tap.
 */
export function beaconContentShare(
    contentId: string | null | undefined,
    voice: ShareVoice | null,
    locale: string,
): void {
    if (!voice) return;
    const loc = locale === "fr" ? "fr" : "en";
    try {
        if (contentId) {
            void fetch(`/api/content/${contentId}/share`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ voice, locale: loc }),
                keepalive: true,
                credentials: "omit",
            }).catch(() => {
                /* observational */
            });
            return;
        }
        beaconShareTap(voice, loc);
    } catch {
        /* observational */
    }
}

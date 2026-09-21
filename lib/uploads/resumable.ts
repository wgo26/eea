"use client";

import {
    CHUNK_SIZE,
    chunkCountFor,
    chunkRange,
    fileSessionKey,
    missingChunks,
} from "@/lib/uploads/chunks";
import type { StorageDestination } from "@/lib/storage/types";

export type ResumableProgress = {
    /** Bytes confirmed stored server-side (received chunks). */
    uploadedBytes: number;
    totalBytes: number;
    doneChunks: number;
    totalChunks: number;
};

export type ResumableResult = {
    url: string;
    kind?: string;
    mimeType?: string;
    durationSeconds?: number | null;
    assetId?: string;
};

export type ResumableOptions = {
    destination: StorageDestination;
    contentItemId?: string | null;
    durationSeconds?: number | null;
    /** Reuse a previous attempt's session (per-file retry resumes mid-file). */
    resumeUploadId?: string | null;
    signal?: AbortSignal | null;
    onProgress?: (progress: ResumableProgress) => void;
};

type SessionRecord = { uploadId: string; updatedAt: number };

const SESSIONS_KEY = "eea-upload-sessions";

function readSessions(): Record<string, SessionRecord> {
    try {
        const raw = localStorage.getItem(SESSIONS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, SessionRecord>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeSessions(sessions: Record<string, SessionRecord>): void {
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
        /* storage full/private — resume degrades to full re-upload */
    }
}

function newUploadId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/** POSTs one multipart form with per-chunk upload progress (XHR). */
function postForm(
    url: string,
    form: FormData,
    opts: { signal?: AbortSignal | null; onChunkProgress?: (loaded: number, total: number) => void },
): Promise<{ ok: boolean; status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.responseType = "text";
        if (opts.signal) {
            if (opts.signal.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
            }
            opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) opts.onChunkProgress?.(e.loaded, e.total);
        };
        xhr.onload = () => {
            let body: unknown = null;
            try {
                body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch {
                body = null;
            }
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
        xhr.send(form);
    });
}

function errMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        return body.error;
    }
    return fallback;
}

/**
 * Resumable chunked upload (Phase 3 — flaky connections).
 *
 * Splits the file into 2 MB chunks, asks the server which indexes it
 * already holds (resume), sends only the missing ones sequentially, then
 * finalizes. Progress covers stored bytes so the bar never runs backwards
 * on retry. Sessions are keyed by name+size+type in localStorage, so a
 * retry — even after navigating away and back — resumes mid-file instead
 * of restarting. Throws Error with the server message on failure.
 */
export async function uploadResumable(
    file: File,
    opts: ResumableOptions,
): Promise<{ result: ResumableResult; uploadId: string }> {
    const totalChunks = chunkCountFor(file.size);
    const key = fileSessionKey(file.name, file.size, file.type);
    const sessions = readSessions();
    const uploadId = opts.resumeUploadId ?? sessions[key]?.uploadId ?? newUploadId();
    if (!opts.resumeUploadId) {
        sessions[key] = { uploadId, updatedAt: Date.now() };
        writeSessions(sessions);
    }

    const report = (doneChunks: number, chunkLoaded = 0) => {
        opts.onProgress?.({
            uploadedBytes: Math.min(
                file.size,
                doneChunks * CHUNK_SIZE + chunkLoaded,
            ),
            totalBytes: file.size,
            doneChunks,
            totalChunks,
        });
    };

    // Resume probe: which chunks does the server already hold?
    let received: number[] = [];
    try {
        const res = await fetch(`/api/uploads/chunk?uploadId=${encodeURIComponent(uploadId)}`, {
            credentials: "same-origin",
            signal: opts.signal ?? undefined,
        });
        if (res.ok) {
            const data = (await res.json()) as { received?: number[] };
            received = Array.isArray(data.received) ? data.received : [];
        }
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        // Probe failure is non-fatal — fall through and send everything.
        received = [];
    }

    let done = received.length;
    report(done);
    for (const index of missingChunks(totalChunks, received)) {
        const { start, end } = chunkRange(index, file.size);
        const form = new FormData();
        form.append("op", "chunk");
        form.append("uploadId", uploadId);
        form.append("index", String(index));
        form.append("totalChunks", String(totalChunks));
        form.append("size", String(file.size));
        form.append("fileName", file.name);
        form.append("mimeType", file.type || "application/octet-stream");
        form.append("destination", opts.destination);
        if (opts.contentItemId) form.append("contentItemId", opts.contentItemId);
        if (opts.durationSeconds != null) form.append("durationSeconds", String(opts.durationSeconds));
        form.append("chunk", file.slice(start, end, file.type || "application/octet-stream"));

        const { ok, status, body } = await postForm("/api/uploads/chunk", form, {
            signal: opts.signal,
            onChunkProgress: (loaded) => report(done, loaded),
        });
        if (!ok) {
            if (status === 429) throw new Error("Too many uploads. Try again later.");
            throw new Error(errMessage(body, "Upload failed."));
        }
        const confirmed = (body as { received?: number[] } | null)?.received;
        done = Array.isArray(confirmed) ? confirmed.length : done + 1;
        report(done);
    }

    // Finalize: server assembles and runs the standard validation pipeline.
    const complete = new FormData();
    complete.append("op", "complete");
    complete.append("uploadId", uploadId);
    const { ok, status, body } = await postForm("/api/uploads/chunk", complete, {
        signal: opts.signal,
    });
    if (!ok) {
        if (status === 409) {
            // Lost a chunk between probe and finalize (server restart, TTL)
            // — surface as retryable, keeping the session for the next pass.
            throw new Error("Some chunks are missing on the server. Retry to resume.");
        }
        if (status === 429) throw new Error("Too many uploads. Try again later.");
        throw new Error(errMessage(body, "Upload failed."));
    }
    const data = (body ?? {}) as {
        publicUrl?: string | null;
        kind?: string;
        mimeType?: string;
        durationSeconds?: number | null;
        assetId?: string;
    };
    const next = readSessions();
    delete next[key];
    writeSessions(next);
    return {
        result: {
            url: data.publicUrl ?? "",
            kind: data.kind,
            mimeType: data.mimeType,
            durationSeconds: data.durationSeconds ?? null,
            assetId: data.assetId,
        },
        uploadId,
    };
}

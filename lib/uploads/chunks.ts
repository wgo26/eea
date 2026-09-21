/**
 * Chunked resumable uploads — shared constants + pure arithmetic.
 *
 * Files are split into 2 MB chunks, each POSTed to /api/uploads/chunk with
 * an {uploadId, index, totalChunks} envelope. The server keeps received
 * chunk indexes per uploadId, so a dropped connection resumes mid-file
 * instead of restarting: the client asks for the received set and sends
 * only what's missing. Single source of truth for both the client
 * (lib/uploads/resumable.ts) and the chunk route.
 */

/** 2 MB — small enough to survive flaky links, large enough to keep a 50 MB upload to 25 requests. */
export const CHUNK_SIZE = 2 * 1024 * 1024;

/** Hard ceiling for an assembled file (mirrors /api/uploads MAX_UPLOAD_BYTES). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Stale sessions are purged by the server after this long. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function chunkCountFor(size: number): number {
    if (!Number.isFinite(size) || size <= 0) return 1;
    return Math.max(1, Math.ceil(size / CHUNK_SIZE));
}

/** Byte range [start, end) for a chunk index. */
export function chunkRange(index: number, size: number): { start: number; end: number } {
    const start = index * CHUNK_SIZE;
    return { start, end: Math.min(start + CHUNK_SIZE, size) };
}

/** Merges a newly received index into a sorted received set. */
export function mergeReceived(received: number[], index: number): number[] {
    if (received.includes(index)) return received;
    return [...received, index].sort((a, b) => a - b);
}

/** Missing chunk indexes for a file of `totalChunks`, given what's stored. */
export function missingChunks(totalChunks: number, received: number[]): number[] {
    const have = new Set(received);
    const out: number[] = [];
    for (let i = 0; i < totalChunks; i += 1) {
        if (!have.has(i)) out.push(i);
    }
    return out;
}

/** Strict UUID check for path-safe uploadIds (no traversal). */
export function isUploadId(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}

/** Local-session identity for a file (resume across retries in one browser). */
export function fileSessionKey(name: string, size: number, type: string): string {
    return `${name}|${size}|${type}`;
}

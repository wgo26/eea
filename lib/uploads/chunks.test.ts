import { describe, expect, it } from "vitest";

import {
    CHUNK_SIZE,
    MAX_UPLOAD_BYTES,
    chunkCountFor,
    chunkRange,
    fileSessionKey,
    isUploadId,
    mergeReceived,
    missingChunks,
} from "./chunks";

describe("chunked upload arithmetic", () => {
    it("uses 2 MB chunks under a 50 MB ceiling", () => {
        expect(CHUNK_SIZE).toBe(2 * 1024 * 1024);
        expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
        expect(chunkCountFor(MAX_UPLOAD_BYTES)).toBe(25);
    });

    it("counts one chunk for empty and small files", () => {
        expect(chunkCountFor(0)).toBe(1);
        expect(chunkCountFor(1)).toBe(1);
        expect(chunkCountFor(CHUNK_SIZE)).toBe(1);
        expect(chunkCountFor(CHUNK_SIZE + 1)).toBe(2);
    });

    it("clips the final chunk range to the file size", () => {
        expect(chunkRange(0, 100)).toEqual({ start: 0, end: 100 });
        expect(chunkRange(0, CHUNK_SIZE * 3)).toEqual({ start: 0, end: CHUNK_SIZE });
        expect(chunkRange(2, CHUNK_SIZE * 2 + 10)).toEqual({
            start: CHUNK_SIZE * 2,
            end: CHUNK_SIZE * 2 + 10,
        });
    });

    it("merges received indexes idempotently and sorted", () => {
        expect(mergeReceived([], 2)).toEqual([2]);
        expect(mergeReceived([0, 2], 2)).toEqual([0, 2]);
        expect(mergeReceived([2, 0], 1)).toEqual([0, 1, 2]);
    });

    it("lists only the missing chunks for resume", () => {
        expect(missingChunks(3, [])).toEqual([0, 1, 2]);
        expect(missingChunks(3, [0, 2])).toEqual([1]);
        expect(missingChunks(3, [0, 1, 2])).toEqual([]);
        expect(missingChunks(3, [0, 1, 2, 9])).toEqual([]);
    });

    it("validates uploadIds strictly", () => {
        expect(isUploadId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
        expect(isUploadId("../etc/passwd")).toBe(false);
        expect(isUploadId("")).toBe(false);
        expect(isUploadId(null)).toBe(false);
        expect(isUploadId(42)).toBe(false);
    });

    it("keys local sessions by name, size and type", () => {
        expect(fileSessionKey("a.jpg", 10, "image/jpeg")).toBe("a.jpg|10|image/jpeg");
        expect(fileSessionKey("a.jpg", 11, "image/jpeg")).not.toBe(
            fileSessionKey("a.jpg", 10, "image/jpeg"),
        );
    });
});

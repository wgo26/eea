import "server-only";

import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getUserRoles, isStaffRoles } from "@/lib/auth/roles";
import type { StorageDestination } from "@/lib/storage/types";
import { SESSION_TTL_MS, isUploadId } from "@/lib/uploads/chunks";

export type SessionAccess =
    | { ok: true; isStaff: boolean }
    | { ok: false; status: number; error: string };

/**
 * Shared upload-session authorization (single-shot /api/uploads and chunked
 * /api/uploads/chunk both call this — one rule, no drift):
 * authenticated user, staff-only admin_asset, and content-item ownership +
 * writable state when attaching to an existing item.
 */
export async function assertUploadAccess(
    supabase: SupabaseClient,
    user: User | null,
    destination: StorageDestination,
    contentItemId: string | null,
): Promise<SessionAccess> {
    if (!user) return { ok: false, status: 401, error: "Not authenticated." };
    if (destination !== "public_photo" && destination !== "admin_asset") {
        return { ok: false, status: 400, error: "Invalid destination." };
    }
    const roles = await getUserRoles(supabase, user.id);
    const isStaff = isStaffRoles(roles);
    if (destination === "admin_asset" && !isStaff) {
        return { ok: false, status: 403, error: "Staff access required for this destination." };
    }
    if (contentItemId) {
        const { data: item, error: itemError } = await supabase
            .from("content_items")
            .select("id, author_id, submitted_by, status")
            .eq("id", contentItemId)
            .maybeSingle();
        if (itemError) return { ok: false, status: 500, error: "Upload failed." };
        if (!item) return { ok: false, status: 400, error: "Unknown content item reference." };
        const writable = new Set(["draft", "pending"]);
        const row = item as { author_id: string | null; submitted_by: string | null; status: string };
        const isOwner = row.author_id === user.id || row.submitted_by === user.id;
        if ((!isOwner && !isStaff) || (!writable.has(row.status) && !isStaff)) {
            return {
                ok: false,
                status: 403,
                error: "You do not have permission to attach media to this item.",
            };
        }
    }
    return { ok: true, isStaff };
}

export type ChunkMeta = {
    fileName: string;
    mimeType: string;
    size: number;
    totalChunks: number;
    destination: StorageDestination;
    contentItemId: string | null;
    durationSeconds: number | null;
    createdAt: number;
};

function sessionDir(userId: string, uploadId: string): string {
    return path.join(os.tmpdir(), "eea-uploads", userId, uploadId);
}

function assertSafeIds(userId: string, uploadId: string): void {
    if (!userId || userId.includes("/") || userId.includes("\\") || userId.includes("..")) {
        throw new Error("Invalid user.");
    }
    if (!isUploadId(uploadId)) throw new Error("Invalid upload id.");
}

/** Chunk indexes already stored for a session (empty when none). */
export async function readReceived(userId: string, uploadId: string): Promise<number[]> {
    assertSafeIds(userId, uploadId);
    try {
        const entries = await fs.readdir(sessionDir(userId, uploadId));
        return entries
            .filter((e) => /^chunk-\d+$/.test(e))
            .map((e) => Number(e.slice("chunk-".length)))
            .filter((n) => Number.isInteger(n) && n >= 0)
            .sort((a, b) => a - b);
    } catch {
        return [];
    }
}

export async function readMeta(userId: string, uploadId: string): Promise<ChunkMeta | null> {
    assertSafeIds(userId, uploadId);
    try {
        const raw = await fs.readFile(path.join(sessionDir(userId, uploadId), "meta.json"), "utf8");
        return JSON.parse(raw) as ChunkMeta;
    } catch {
        return null;
    }
}

export async function writeChunk(
    userId: string,
    uploadId: string,
    index: number,
    data: Buffer,
    meta: ChunkMeta,
): Promise<void> {
    assertSafeIds(userId, uploadId);
    const dir = sessionDir(userId, uploadId);
    await fs.mkdir(dir, { recursive: true });
    const metaPath = path.join(dir, "meta.json");
    try {
        await fs.access(metaPath);
    } catch {
        await fs.writeFile(metaPath, JSON.stringify(meta));
    }
    await fs.writeFile(path.join(dir, `chunk-${index}`), data);
}

/** Assembles chunks 0..totalChunks-1 in order; throws when any is missing. */
export async function assembleSession(
    userId: string,
    uploadId: string,
    totalChunks: number,
): Promise<Buffer> {
    assertSafeIds(userId, uploadId);
    const dir = sessionDir(userId, uploadId);
    const parts: Buffer[] = [];
    for (let i = 0; i < totalChunks; i += 1) {
        try {
            parts.push(await fs.readFile(path.join(dir, `chunk-${i}`)));
        } catch {
            throw new Error(`Missing chunk ${i}.`);
        }
    }
    return Buffer.concat(parts);
}

export async function destroySession(userId: string, uploadId: string): Promise<void> {
    try {
        assertSafeIds(userId, uploadId);
        await fs.rm(sessionDir(userId, uploadId), { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
}

/** Best-effort purge of sessions older than SESSION_TTL_MS (all users). */
export async function purgeStaleSessions(now = Date.now()): Promise<void> {
    const root = path.join(os.tmpdir(), "eea-uploads");
    let users: string[] = [];
    try {
        users = await fs.readdir(root);
    } catch {
        return;
    }
    for (const userId of users) {
        let sessions: string[] = [];
        try {
            sessions = await fs.readdir(path.join(root, userId));
        } catch {
            continue;
        }
        for (const uploadId of sessions) {
            try {
                const raw = await fs.readFile(path.join(root, userId, uploadId, "meta.json"), "utf8");
                const meta = JSON.parse(raw) as Partial<ChunkMeta>;
                if (typeof meta.createdAt === "number" && now - meta.createdAt > SESSION_TTL_MS) {
                    await fs.rm(path.join(root, userId, uploadId), { recursive: true, force: true });
                }
            } catch {
                /* unreadable session — leave it for the next pass */
            }
        }
    }
}

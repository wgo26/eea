import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { storageConfig } from '../config'

let client: S3Client | null = null

function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: storageConfig.b2.endpoint,
      credentials: {
        accessKeyId: storageConfig.b2.keyId,
        secretAccessKey: storageConfig.b2.applicationKey,
      },
    })
  }
  return client
}

/**
 * B2 is the backup mirror described in Section 14 — it is never written to
 * as part of an interactive upload. This is called by the nightly
 * R2→B2 mirroring job (lib/storage/backup.ts) and the pg_dump cron, not by uploadMedia().
 */
export async function uploadToB2(
  bucket: string,
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    })
  )
}

/** Downloads a mirrored object back from B2 (verify path + restore drills). */
export async function downloadFromB2(storageKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: storageConfig.b2.bucket, Key: storageKey })
  )
  const bytes = await result.Body!.transformToByteArray()
  return { buffer: Buffer.from(bytes), mimeType: result.ContentType ?? 'application/octet-stream' }
}

/** Lightweight existence check for readiness probes (no body download). */
export async function headBackupObject(storageKey: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: storageConfig.b2.bucket, Key: storageKey })
    )
    return true
  } catch {
    return false
  }
}

/**
 * Paginated key listing for orphan accounting (which B2 objects have no DB
 * row pointing at them). Read-only — orphans are reported, never deleted:
 * the mirror is the disaster-recovery copy.
 */
export async function listBackupKeys(prefix = '', maxKeys = 5000): Promise<string[]> {
  const keys: string[] = []
  let token: string | undefined
  for (;;) {
    const res = await getClient().send(
      new ListObjectsV2Command({
        Bucket: storageConfig.b2.bucket,
        Prefix: prefix || undefined,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
      if (keys.length >= maxKeys) return keys
    }
    if (!res.IsTruncated) return keys
    token = res.NextContinuationToken
  }
}

/**
 * Phase 5 — delete a backup object (retention enforcement for expired
 * pg_dump artifacts). Never called from interactive paths — only the
 * db-dump cron prunes rows past `db_dumps.expires_at`.
 */
export async function deleteFromB2(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: storageConfig.b2.bucket, Key: storageKey })
  )
}

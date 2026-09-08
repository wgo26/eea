import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
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
 * R2→B2 mirroring job (lib/storage/backup.ts), not by uploadMedia().
 */
export async function uploadToB2(storageKey: string, buffer: Buffer, mimeType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: storageConfig.b2.bucket,
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

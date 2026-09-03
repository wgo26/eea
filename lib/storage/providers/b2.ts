import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
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

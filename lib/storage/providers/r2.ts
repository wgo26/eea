import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { storageConfig } from '../config'

let client: S3Client | null = null

function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${storageConfig.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: storageConfig.r2.accessKeyId,
        secretAccessKey: storageConfig.r2.secretAccessKey,
      },
    })
  }
  return client
}

export async function uploadToR2(storageKey: string, buffer: Buffer, mimeType: string): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: storageConfig.r2.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
  return `${storageConfig.r2.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`
}

export async function deleteFromR2(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: storageConfig.r2.bucket, Key: storageKey })
  )
}

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { storageConfig } from "../config"

let client: S3Client | null = null

function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${storageConfig.r2.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: storageConfig.r2.accessKeyId,
        secretAccessKey: storageConfig.r2.secretAccessKey,
      },
    })
  }
  return client
}

export async function uploadToR2(storageKey: string, buffer: Buffer, mimeType: string): Promise<string> {
  const cfg = storageConfig.r2
  const missing = [
    !cfg.accountId ? "R2_ACCOUNT_ID" : null,
    !cfg.accessKeyId ? "R2_ACCESS_KEY_ID" : null,
    !cfg.secretAccessKey ? "R2_SECRET_ACCESS_KEY" : null,
    !cfg.bucket ? "R2_BUCKET" : null,
    !cfg.publicBaseUrl ? "R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL" : null,
  ].filter((name): name is string => name !== null)
  if (missing.length > 0) {
    throw new Error(`R2 storage is not configured. Missing: ${missing.join(", ")}.`)
  }
  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )
  return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${storageKey}`
}

export async function deleteFromR2(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: storageConfig.r2.bucket, Key: storageKey }),
  )
}

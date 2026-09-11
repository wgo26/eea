import { readFileSync } from "node:fs";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const env = readFileSync(new URL("./.env", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];
const accountId = get("R2_ACCOUNT_ID");
const bucket = get("R2_BUCKET");
console.log("accountId:", accountId, "bucket:", bucket, "base:", get("R2_PUBLIC_BASE_URL"));

const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: get("R2_ACCESS_KEY_ID"), secretAccessKey: get("R2_SECRET_ACCESS_KEY") },
});

try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 3, Prefix: "public-photo/" }));
    console.log("LIST OK:", list.Contents?.length ?? 0, "keys");
    for (const o of list.Contents ?? []) console.log("  ", o.Key);
} catch (e) {
    console.error("LIST FAILED:", e.name, e.message, e.Code ?? "", e.ResourceType ?? "");
    console.error("$metadata:", JSON.stringify(e.$metadata ?? {}));
}

try {
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: "public-photo/_probe/scratch-probe.txt",
        Body: Buffer.from("eea import probe"),
        ContentType: "text/plain",
    }));
    console.log("PUT OK");
} catch (e) {
    console.error("PUT FAILED:", e.name, "|", e.message);
    console.error("$metadata:", JSON.stringify(e.$metadata ?? {}));
}

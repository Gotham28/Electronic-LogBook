import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Narrow object-storage interface. Route code only ever sees this, so tests can
 * swap in an in-memory fake and never need real credentials.
 */
export interface FileStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

const REQUIRED = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;

/** Fail closed: throws naming the first missing variable. No fallbacks. Never echoes a value. */
export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  for (const name of REQUIRED) {
    if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }
  return {
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucketName: env.R2_BUCKET_NAME!,
  };
}

/** Object keys carry no student id, name or title. */
export function newCertificateFileKey(): string {
  return `certificates/${randomUUID()}`;
}

export function createR2Storage(config: StorageConfig): FileStorage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucketName;
  return {
    async put(key, bytes, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: contentType }));
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!out.Body) return null;
        const bytes = Buffer.from(await out.Body.transformToByteArray());
        return { bytes, contentType: out.ContentType ?? "application/octet-stream" };
      } catch (err) {
        if ((err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

// Fail closed at startup: importing this module with a missing variable throws,
// mirroring src/lib/env.ts. The client itself is built lazily.
const config = loadStorageConfig();

let current: FileStorage | undefined;

export function getFileStorage(): FileStorage {
  current ??= createR2Storage(config);
  return current;
}

/** Test injection point. Pass undefined to restore the real implementation. */
export function setFileStorageForTests(storage: FileStorage | undefined): void {
  current = storage;
}

/**
 * Best-effort removal of objects whose database rows are already gone. Never throws and never
 * changes the caller's response. Logs counts only (never a key, name or storage error body).
 */
export async function deleteStoredFilesBestEffort(
  keys: string[],
  log: { error: (obj: object, msg: string) => void },
): Promise<void> {
  if (keys.length === 0) return;
  let failed = 0;
  for (const key of keys) {
    try { await getFileStorage().delete(key); } catch { failed++; }
  }
  if (failed > 0) log.error({ failed, total: keys.length }, "Certificate file cleanup after account delete incomplete");
}

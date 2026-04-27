// Storage backend interface. Implementations: local filesystem (dev) and
// Cloudflare R2 (prod, when keys are configured). The route picks at
// runtime via env-var probe.

import { env } from "../env";

export interface StorageBackend {
  /** Store the given bytes under a fresh key, return the key. */
  put(filename: string, bytes: Buffer): Promise<{ key: string; sizeBytes: number }>;
  /** Read a previously stored object. */
  get(key: string): Promise<Buffer>;
  /** Delete a stored object. Idempotent. */
  remove(key: string): Promise<void>;
  /** Resolve the key to a path the Rust parser CLI can read. */
  resolveLocalPath(key: string): Promise<string>;
}

export async function getStorage(): Promise<StorageBackend> {
  if (env.r2.bucket && env.r2.accessKeyId) {
    // Lazy-load to keep the AWS SDK off the cold path when unused.
    const { LocalStorage } = await import("./local");
    // TODO: swap to R2 backend (s3-compatible) once the upload pipeline
    // proves stable on local disk.
    return new LocalStorage();
  }
  const { LocalStorage } = await import("./local");
  return new LocalStorage();
}

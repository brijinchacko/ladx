// Local filesystem storage. Files live under `.ladx-storage/` at the
// repo root. Keys are random UUIDs + the original extension so the Rust
// parser can detect format from the path. Per ADR-style note: when R2 is
// wired, the same interface routes there transparently.

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageBackend } from "./index";

const STORAGE_DIR = path.resolve(process.cwd(), ".ladx-storage");

export class LocalStorage implements StorageBackend {
  async put(filename: string, bytes: Buffer) {
    await mkdir(STORAGE_DIR, { recursive: true });
    const ext = path.extname(filename) || "";
    const key = `${randomUUID()}${ext}`;
    const full = path.join(STORAGE_DIR, key);
    await writeFile(full, bytes);
    return { key, sizeBytes: bytes.byteLength };
  }

  async get(key: string) {
    const full = this.assertSafeKey(key);
    return readFile(full);
  }

  async remove(key: string) {
    const full = this.assertSafeKey(key);
    await rm(full, { force: true });
  }

  async resolveLocalPath(key: string) {
    return this.assertSafeKey(key);
  }

  private assertSafeKey(key: string): string {
    // Defence in depth, keys are UUIDs we minted ourselves, but
    // double-check there's no traversal before touching the filesystem.
    if (key.includes("/") || key.includes("\\") || key.includes("..")) {
      throw new Error("invalid storage key");
    }
    return path.join(STORAGE_DIR, key);
  }
}

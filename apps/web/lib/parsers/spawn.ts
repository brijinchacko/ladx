// Node spawn helper for the Rust `ladx-parser` CLI. Looks for the binary
// in target/release first (production deploys ship it there) then falls
// back to target/debug for dev. Throws a clear error if neither exists,
// pointing the user at the build command.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ParseResult } from "@ladx/types";

const exec = promisify(execFile);

// Walk up to the workspace root (where Cargo.toml lives next to target/).
function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (
      existsSync(path.join(dir, "Cargo.toml")) &&
      existsSync(path.join(dir, "pnpm-workspace.yaml"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume cwd is apps/web and the workspace root is two up.
  return path.resolve(process.cwd(), "../..");
}

export function ladxParserBinary(): string {
  const root = findWorkspaceRoot();
  const release = path.join(root, "target", "release", "ladx-parser");
  const debug = path.join(root, "target", "debug", "ladx-parser");
  if (existsSync(release)) return release;
  if (existsSync(debug)) return debug;
  throw new Error(
    `ladx-parser binary not found. Run: cargo build --release --bin ladx-parser. (looked in ${release} and ${debug})`,
  );
}

export async function parseProjectFile(localPath: string): Promise<ParseResult> {
  const bin = ladxParserBinary();
  // 30s timeout, even very large L5X files parse in <5s on release build.
  const { stdout } = await exec(bin, [localPath], {
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as ParseResult;
}

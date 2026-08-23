// Spawn helper for the Rust `ladx-validate` CLI. Same lookup pattern as
// the parser binary, release first, debug fallback, clear error if
// missing. Source is piped over stdin so we don't need a tmp file on the
// Node side.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ValidatorReport } from "@ladx/types";

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
  return path.resolve(process.cwd(), "../..");
}

export function ladxValidateBinary(): string {
  const root = findWorkspaceRoot();
  const release = path.join(root, "target", "release", "ladx-validate");
  const debug = path.join(root, "target", "debug", "ladx-validate");
  if (existsSync(release)) return release;
  if (existsSync(debug)) return debug;
  throw new Error(
    "ladx-validate binary not found. Run: cargo build --release --bin ladx-validate.",
  );
}

export async function validateSt(source: string): Promise<ValidatorReport> {
  const bin = ladxValidateBinary();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, ["--language", "st"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on("data", (b) => stdoutChunks.push(b));
    proc.stderr.on("data", (b) => stderrChunks.push(b));

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ladx-validate timed out after 30s"));
    }, 30_000);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        reject(new Error(`ladx-validate exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ValidatorReport);
      } catch (err) {
        reject(new Error(`ladx-validate output not JSON: ${err}`));
      }
    });

    proc.stdin.write(source);
    proc.stdin.end();
  });
}

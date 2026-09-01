// Node spawn helper for the Rust `ladx-parser` CLI. Looks for the binary
// in target/release first (production deploys ship it there) then falls
// back to target/debug for dev. Throws a clear error if neither exists,
// pointing the user at the build command.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ConversionReport, HealthReport, IrProject, ParseResult, Trace } from "@ladx/types";

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

/**
 * The Siemens half of the bridge.
 *
 * A second binary rather than another mode on the first, because the SCL
 * generator lives in the crate that depends on the parser crate and putting it
 * there would be a dependency cycle. Both are built and deployed together.
 */
export function ladxSiemensBinary(): string {
  const root = findWorkspaceRoot();
  const release = path.join(root, "target", "release", "ladx-siemens");
  const debug = path.join(root, "target", "debug", "ladx-siemens");
  if (existsSync(release)) return release;
  if (existsSync(debug)) return debug;
  throw new Error(
    `ladx-siemens binary not found. Run: cargo build --release --bin ladx-siemens. (looked in ${release} and ${debug})`,
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

/**
 * The same file, read for its logic rather than its names.
 *
 * A separate call rather than an option on the one above, because the two
 * return different things and the existing shape is what the project picker
 * consumes. Adding a field to that would be a change every caller has to
 * tolerate for the sake of one that wants it.
 *
 * Rockwell L5X only today. The binary refuses anything else by name rather
 * than failing somewhere deeper.
 */
export async function parseProjectToIr(localPath: string): Promise<IrImport> {
  const bin = ladxParserBinary();
  const { stdout } = await exec(bin, ["--ir", localPath], {
    timeout: 30_000,
    // Larger than the manifest path: this carries every rung in the project,
    // and a big line is thousands of them.
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(stdout) as IrImport;
}

export interface IrImport {
  project: IrProject;
  report: ConversionReport;
  /** One line, for showing without making somebody read the whole report. */
  summary: string;
}

/**
 * Analysis over an IR document.
 *
 * The project is written to a temporary file rather than piped, because the
 * binary takes a path and a large project on stdin is a second thing to get
 * right for no benefit. The file is removed whether or not the call succeeds.
 */
async function withIrFile<T>(project: unknown, run: (path: string) => Promise<T>): Promise<T> {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-ir-"));
  const file = path.join(dir, "project.ir.json");
  try {
    await writeFile(file, JSON.stringify(project));
    return await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What is worth telling somebody about this project. */
export async function analyseIr(project: unknown): Promise<HealthReport> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--health", file], {
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout) as HealthReport;
  });
}

/** What would have to be true for a tag to come on. */
export async function whyNotIr(project: unknown, tag: string): Promise<Trace> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--why", file, tag], {
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout) as Trace;
  });
}

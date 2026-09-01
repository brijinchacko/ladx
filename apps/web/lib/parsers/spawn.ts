// Node spawn helper for the Rust `ladx-parser` CLI. Looks for the binary
// in target/release first (production deploys ship it there) then falls
// back to target/debug for dev. Throws a clear error if neither exists,
// pointing the user at the build command.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  Alarm,
  AlarmIssue,
  ConversionReport,
  HealthReport,
  IoIssue,
  IoPoint,
  IrProject,
  ParseResult,
  Trace,
} from "@ladx/types";
import type {
  Block,
  Deviation,
  Drift,
  HardwareFinding,
  HardwareModule,
  NarrativeSection,
  Pack,
  ProposedScreen,
  Sequence,
  TestGroup,
} from "@ladx/types";

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

/** Which written standards apply to a request, and the text a prompt gets. */
export interface ApplicableStandards {
  /** Vetoes first, labelled as such. Empty string when nothing applies. */
  prompt: string;
  /** Ids, so a caller can say which ones it used rather than leaving somebody
   *  to guess why an answer came out the way it did. */
  forbidden: string[];
  guidance: string[];
}

export async function applicableStandards(
  memories: unknown[],
  request: string,
  project: string | null,
): Promise<ApplicableStandards> {
  // Nothing written down is the common case and does not need a subprocess.
  if (memories.length === 0) return { prompt: "", forbidden: [], guidance: [] };

  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-std-"));
  const file = path.join(dir, "standards.json");
  try {
    await writeFile(file, JSON.stringify({ memories, request, project }));
    const { stdout } = await exec(ladxParserBinary(), ["--standards", file], {
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout) as ApplicableStandards;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The I/O list, read out of a project. */
export async function ioListFor(project: unknown): Promise<{
  points: IoPoint[];
  issues: IoIssue[];
  inputs: number;
  outputs: number;
  csv: string;
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--io", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

/** The alarms a program already has. */
export async function alarmListFor(project: unknown): Promise<{
  alarms: Alarm[];
  issues: AlarmIssue[];
  csv: string;
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--alarms", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

/**
 * The steps the machine moves through, read out of the step register.
 *
 * An empty list of sequences is not "this machine has no sequence": it is
 * "nothing here was written in a shape this recognises", which is why the
 * notes come back with it and the caller shows them.
 */
export async function sequencesFor(project: unknown): Promise<{
  sequences: Sequence[];
  notes: string[];
  text: string;
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--sequence", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

/** Acceptance tests written from the logic. Not carried out by anything. */
export async function testPlanFor(project: unknown): Promise<{
  groups: TestGroup[];
  notCovered: string[];
  safetySteps: number;
  markdown: string;
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--tests", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

/** Where the program departs from the standard blocks. */
export async function deviationsFor(project: unknown): Promise<{
  deviations: Deviation[];
  blocks: Block[];
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--deviations", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

/** The program against another tag list: an HMI export, an I/O schedule. */
export async function driftFor(
  project: unknown,
  sources: unknown,
): Promise<{
  drifts: Drift[];
  notes: string[];
  breaking: number;
  text: string;
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-drift-"));
    const lists = path.join(dir, "taglists.json");
    try {
      await writeFile(lists, JSON.stringify(sources), "utf8");
      const { stdout } = await exec(bin, ["--drift", file, lists], {
        timeout: 30_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/**
 * The handover pack.
 *
 * The tag lists are optional and their absence is not silent: the pack says on
 * its own manifest that nothing was compared, because a pack that looks
 * complete is the harder thing to catch.
 */
export async function handoverPackFor(project: unknown, sources?: unknown): Promise<Pack> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    if (!sources) {
      const { stdout } = await exec(bin, ["--handover", file], {
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    }
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-pack-"));
    const lists = path.join(dir, "taglists.json");
    try {
      await writeFile(lists, JSON.stringify(sources), "utf8");
      const { stdout } = await exec(bin, ["--handover", file, lists], {
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

/**
 * The control narrative: what the program does, in sentences.
 *
 * The one document somebody who cannot read ladder can actually use, and the
 * one that is normally written last, by hand, from a program the author has
 * stopped thinking about.
 */
export async function narrativeFor(project: unknown): Promise<{
  sections: NarrativeSection[];
  gaps: number;
  markdown: string;
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--narrative", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

/**
 * The racks, and the addresses that do not match them.
 *
 * Takes an L5X rather than an IR project: the module list is hardware
 * configuration and lives in the export, not in the program. A program-only
 * export carries none, and the answer says so rather than showing an empty
 * rack.
 */
export async function hardwareFor(localPath: string): Promise<{
  modules: HardwareModule[];
  notes: string[];
  findings: HardwareFinding[];
  breaking: number;
  table: string;
}> {
  const bin = ladxParserBinary();
  const { stdout } = await exec(bin, ["--hardware", localPath], {
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/**
 * Screens proposed from the program, without asking a model.
 *
 * Different from /api/hmi/generate, which turns a description into objects on
 * the glass. This reads the program: what is wired to the plant, which way each
 * signal goes, and which tags are safety related. A safety device that can be
 * operated from a screen is not a safety device, and that judgement is not one
 * to leave to a model.
 */
export async function proposedScreensFor(project: unknown): Promise<{
  screens: ProposedScreen[];
  notes: string[];
}> {
  const bin = ladxParserBinary();
  return withIrFile(project, async (file) => {
    const { stdout } = await exec(bin, ["--screens", file], {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  });
}

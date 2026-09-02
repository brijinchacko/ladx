import { saveProgram } from "@/lib/db/ladder";
import { parseProjectToIr } from "@/lib/parsers/spawn";
import { ladxProgramFromIr } from "@ladx/studio";

/**
 * Read an uploaded PLC file into the ladder editor's program, and keep it.
 *
 * The Rust parser produces the IR, which carries every rung. The editor works
 * on its own smaller model, and the conversion between the two already existed
 * for the Convert tool's "Open an L5X" button. This is the same conversion run
 * on the server at upload time, so the program exists before anybody opens a
 * tool, rather than only after they find the right menu.
 *
 * Returns what was kept and what was not: the editor has no floating point
 * and no structured text, and a routine in either is reported rather than
 * silently gone.
 */
export async function programFromUpload(
  userId: string,
  projectId: string,
  name: string,
  localPath: string,
): Promise<{ rungs: number; dropped: number }> {
  const ir = await parseProjectToIr(localPath);
  const { program, dropped } = ladxProgramFromIr(ir.project);
  await saveProgram(userId, projectId, name, program);
  const rungs = program.routines?.reduce((n, r) => n + (r.rungs?.length ?? 0), 0) ?? 0;
  return { rungs, dropped: dropped.length };
}

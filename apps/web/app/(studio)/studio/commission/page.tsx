import { CommissionClient } from "@/components/studio/commission-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { partitionRunnable } from "@/lib/ladder/runnable";

export const dynamic = "force-dynamic";

/**
 * Commissioning: what gets checked before a machine is handed over.
 *
 * The work at the end of a job is mostly reading the program back and writing
 * down what it does: the sequence, the test steps, the tag lists, the pack.
 * All of it is already in the program, and all of it is normally retyped by
 * somebody who has moved on to the next job, which is why handover documents
 * are late and wrong.
 *
 * Nothing here has been carried out. These are steps for a person, and the
 * pack says so on its own manifest rather than letting its own size imply
 * otherwise.
 */
export default async function CommissionPage() {
  const user = await requireUser();
  const programs = await listPrograms(user.id);
  const { runnable } = partitionRunnable(programs);

  return (
    <>
      <WorkspaceHeader
        title="Commissioning"
        subtitle="The sequence, the acceptance tests, the tag comparison and the handover pack, all read out of the program. Nothing here has been carried out; these are steps for a person."
      />
      <CommissionClient
        programs={runnable.map((p) => ({ id: p.id, name: p.name, program: p.program }))}
      />
    </>
  );
}

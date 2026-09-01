import { StandardsClient } from "@/components/studio/standards-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listProjects } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

/**
 * Standards, which is engineering memory with a name somebody would look for.
 *
 * "Memory" is what it is called in the code and would be the wrong word on a
 * navigation bar: an engineer looking for where the company's approved motor
 * block is written down does not go looking for a memory. They go looking for
 * standards.
 */
export default async function StandardsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <>
      <WorkspaceHeader
        title="Standards"
        subtitle="How work is done here: what to use, what never to use, and how things are named. LADX reads these before it writes anything, and shows you which ones it used."
      />
      <StandardsClient projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </>
  );
}

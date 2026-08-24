import { NewProjectForm } from "@/components/platform/project-controls";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { getPhase } from "@/lib/platform/lifecycle";
import { listClients, listProjects } from "@/lib/platform/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const [projects, clients] = await Promise.all([listProjects(user.id), listClients(user.id)]);

  return (
    <>
      <WorkspaceHeader
        title="Projects"
        subtitle="Every job, from requirements to handover. Each one generates its own documents."
        actions={<NewProjectForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <div className="rounded-sm border border-dashed border-ink-200 p-12 text-center">
            <p className="text-ink-500">No projects yet.</p>
            <p className="mt-1 text-[13.5px] text-ink-400">
              Create one to start working through the lifecycle, from URS to handover.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-sm border border-ink-100">
            {projects.map((p) => {
              const phase = getPhase(p.phase);
              return (
                <li key={p.id}>
                  <Link
                    href={`/studio/projects/${p.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-ink-50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="truncate font-semibold text-ink-900">{p.name}</span>
                        {p.code && (
                          <span className="shrink-0 font-mono text-[12px] text-ink-400">
                            {p.code}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-ink-500">
                        {p.clientName ?? "No client"}
                        {p.site ? `  ·  ${p.site}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-sm border border-teal-300 bg-teal-50 px-2 py-0.5 font-mono text-[11px] text-teal-700">
                      {phase.step ? `${phase.step}. ` : ""}
                      {phase.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

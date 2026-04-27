import { DeleteProjectButton } from "@/components/delete-project-button";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .limit(1);

  const project = rows[0];
  if (!project) notFound();

  const stats: Array<{ label: string; value: number }> = [
    { label: "Routines", value: project.routineCount },
    { label: "Tags", value: project.tagCount },
    { label: "UDTs", value: project.udtCount },
    { label: "AOIs", value: project.aoiCount },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight mb-1 truncate">{project.name}</h1>
          <p className="text-ink-500 text-sm">
            {project.vendor} · {(project.sizeBytes / 1024).toFixed(1)} KB · uploaded{" "}
            {new Date(project.createdAt).toLocaleString()}
          </p>
        </div>
        <DeleteProjectButton projectId={project.id} />
      </header>

      {project.parseError && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 mb-6 text-sm text-danger">
          Parse error: {project.parseError}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-ink-100 p-5">
            <p className="text-xs text-ink-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-3xl font-semibold mt-1">{s.value}</p>
          </div>
        ))}
      </section>

      <section className="border border-ink-100 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-2">Chat about this project</h2>
        <p className="text-sm text-ink-500 mb-3">
          Project-scoped chat (with routine retrieval) lands in the next Phase 1 sub-task. Use the{" "}
          <a href="/chat" className="text-teal-500 hover:text-teal-600">
            general Chat
          </a>{" "}
          page in the meantime.
        </p>
      </section>
    </div>
  );
}

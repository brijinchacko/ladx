import { UploadButton } from "@/components/upload-button";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  const rows = await db()
    .select()
    .from(projects)
    .where(eq(projects.userId, user.id))
    .orderBy(projects.createdAt);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-ink-500">
            Upload an L5X (Rockwell) or PLCopen TC6 .xml file. Drag-and-drop coming soon.
          </p>
        </div>
        <UploadButton />
      </header>

      {rows.length === 0 ? (
        <div className="border border-dashed border-ink-200 rounded-lg p-12 text-center text-ink-500">
          No projects yet. Upload your first one to get started.
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 border border-ink-100 rounded-lg overflow-hidden">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="block px-5 py-4 hover:bg-ink-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 truncate">{p.name}</p>
                    <p className="text-xs text-ink-500">
                      {p.vendor} · {p.routineCount} routines · {p.tagCount} tags
                      {p.parseError ? " · parse error" : ""}
                    </p>
                  </div>
                  <p className="text-xs text-ink-400 shrink-0">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

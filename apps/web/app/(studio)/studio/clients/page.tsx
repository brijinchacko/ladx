import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listClients } from "@/lib/platform/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireUser();
  const clients = await listClients(user.id);

  return (
    <>
      <WorkspaceHeader
        title="Clients"
        subtitle="The people your projects are for. Their details flow onto every document."
        actions={
          <Link
            href="/studio/clients/new"
            className="rounded-md bg-ink-900 px-3.5 py-1.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            New client
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {clients.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-200 p-12 text-center">
            <p className="text-ink-500">No clients yet.</p>
            <Link
              href="/studio/clients/new"
              className="mt-2 inline-block text-teal-700 hover:underline"
            >
              Add your first client
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-100">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/studio/clients/${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-ink-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{c.name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-500">
                      {[c.contactName, c.industry, [c.city, c.country].filter(Boolean).join(", ")]
                        .filter(Boolean)
                        .join("  ·  ") || "No details yet"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[12px] text-ink-400">
                    {c.projectCount} {c.projectCount === 1 ? "project" : "projects"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

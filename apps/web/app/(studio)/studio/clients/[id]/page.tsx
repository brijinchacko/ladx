import ClientForm, { DeleteClientButton } from "@/components/platform/client-form";
import { requireUser } from "@/lib/auth/server";
import { getClient, listProjects } from "@/lib/platform/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClient(user.id, id);
  if (!client) notFound();

  const projects = (await listProjects(user.id)).filter((p) => p.clientId === id);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <nav className="mb-6 font-mono text-[11.5px] text-ink-400">
        <Link href="/studio/clients" className="hover:text-ink-700">
          Clients
        </Link>
      </nav>
      <header className="mb-6 flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">{client.name}</h1>
        <DeleteClientButton id={client.id} name={client.name} />
      </header>

      <ClientForm initial={client} />

      <section className="mt-12 border-t border-ink-100 pt-8">
        <h2 className="mb-4 text-lg font-semibold text-ink-900">
          Projects for this client{projects.length > 0 && ` (${projects.length})`}
        </h2>
        {projects.length === 0 ? (
          <p className="text-[14px] text-ink-500">
            None yet.{" "}
            <Link href="/studio/projects" className="text-teal-700 hover:underline">
              Create a project
            </Link>{" "}
            and assign it here.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-sm border border-ink-100">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/studio/projects/${p.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-ink-50"
                >
                  <span className="font-medium text-ink-900">{p.name}</span>
                  {p.code && (
                    <span className="ml-2 font-mono text-[12px] text-ink-400">{p.code}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

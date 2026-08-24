import ClientForm from "@/components/platform/client-form";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requireUser();
  return (
    <>
      <WorkspaceHeader title="New client" subtitle="Who the work is for." />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-7">
          <nav className="mb-6 font-mono text-[11.5px] text-ink-400">
            <Link href="/studio/clients" className="hover:text-ink-700">
              Clients
            </Link>
          </nav>
          <ClientForm />
        </div>
      </div>
    </>
  );
}

import ClientForm from "@/components/platform/client-form";
import { requireUser } from "@/lib/auth/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl p-8">
      <nav className="mb-6 font-mono text-[11.5px] text-ink-400">
        <Link href="/studio/clients" className="hover:text-ink-700">
          Clients
        </Link>
      </nav>
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">New client</h1>
      <ClientForm />
    </div>
  );
}

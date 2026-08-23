import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * Billing is gone: inference runs on the user's own provider key, so there is
 * nothing for us to meter or charge for. The Providers section — where those
 * keys are added — is added in M2 alongside the encrypted key store.
 */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Settings</h1>
        <p className="text-ink-500">Your account and AI providers.</p>
      </header>

      <section className="border border-ink-100 rounded-lg p-6 space-y-1">
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="text-sm text-ink-500">{user.email}</p>
        {user.displayName && <p className="text-sm text-ink-500">{user.displayName}</p>}
      </section>
    </div>
  );
}

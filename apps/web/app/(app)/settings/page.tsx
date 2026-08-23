import { ProvidersPanel } from "@/components/providers-panel";
import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * There is no billing here and there will not be: inference runs on the user's
 * own provider key, so there is nothing for us to meter or charge for. What
 * that makes important instead is the providers panel, until a key is
 * connected, the AI half of LADX cannot do anything at all.
 */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-10 p-8">
      <header>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-ink-500">Your account and the AI providers you have connected.</p>
      </header>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink-900">AI providers</h2>
          <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
            LADX has no AI key of its own, everything runs on yours, so nothing you send is metered
            or billed by us. If you have none, OpenRouter takes an email and no card, and its free
            models cost nothing to run.
          </p>
        </div>
        <ProvidersPanel />
      </section>

      <section className="rounded-sm border border-ink-100 p-6">
        <h2 className="mb-1 text-lg font-semibold text-ink-900">Account</h2>
        <p className="text-sm text-ink-500">{user.email}</p>
        {user.displayName && <p className="text-sm text-ink-500">{user.displayName}</p>}
      </section>
    </div>
  );
}

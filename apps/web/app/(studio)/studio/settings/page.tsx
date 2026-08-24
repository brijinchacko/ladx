import CompanyForm from "@/components/platform/company-form";
import { ProvidersPanel } from "@/components/providers-panel";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { getCompany } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * Two things live here, in the order they matter on day one. The company
 * profile is first because it is what makes generated documents yours: enter it
 * once and it is on every FDS, FAT and handover pack. The providers panel is
 * second because until a key is connected, the AI half of the platform cannot
 * do anything. There is no billing, and there will not be: inference runs on
 * the user's own key.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const company = await getCompany(user.id);

  return (
    <>
      <WorkspaceHeader
        title="Settings"
        subtitle="Your company, the AI providers you have connected, and your account."
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-12 p-6">
          <section>
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-ink-900">Company profile</h2>
              <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
                Entered once, stamped onto every document the platform generates. The logo and
                details become the letterhead on your FDS, FAT, SAT and handover documents.
              </p>
            </div>
            <CompanyForm initial={company} />
          </section>

          <section className="border-t border-ink-100 pt-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink-900">AI providers</h2>
              <p className="mt-1 max-w-2xl text-[14.5px] leading-relaxed text-ink-500">
                LADX has no AI key of its own, everything runs on yours, so nothing you send is
                metered or billed by us. If you have none, OpenRouter takes an email and no card,
                and its free models cost nothing to run.
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
      </div>
    </>
  );
}

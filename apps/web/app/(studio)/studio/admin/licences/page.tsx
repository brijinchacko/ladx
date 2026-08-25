import { Section } from "@/components/studio/admin-chrome";
import AdminLicences, { type LicenceRow } from "@/components/studio/admin-licences";
import { requireAdmin } from "@/lib/auth/admin";
import { activationIsOpen, listLicences } from "@/lib/db/licences";

export const dynamic = "force-dynamic";

/**
 * Desktop keys.
 *
 * The desktop is the local-first product: it runs offline, makes no outbound
 * call, and this is the one exception, checked once. Everything about whether
 * a copy runs is decided by a row here.
 */
export default async function AdminLicencesPage() {
  await requireAdmin();
  const rows = await listLicences();

  const forClient: LicenceRow[] = rows.map((l) => ({
    ...l,
    activatedAt: l.activatedAt?.toISOString() ?? null,
    lastSeenAt: l.lastSeenAt?.toISOString() ?? null,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    revokedAt: l.revokedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <Section
        title="Desktop licences"
        blurb="One key, one machine. Stored hashed, so a key is shown once and never again."
      >
        <AdminLicences rows={forClient} open={activationIsOpen()} />
      </Section>
    </div>
  );
}

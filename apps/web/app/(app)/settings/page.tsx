export default function SettingsPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Settings</h1>
        <p className="text-ink-500">Account, billing, and inference preferences.</p>
      </header>
      <section className="border border-ink-100 rounded-lg p-6">
        <h2 className="text-lg font-semibold">Subscription</h2>
        <p className="text-sm text-ink-500 mt-1">
          Manage via Stripe Customer Portal once Stripe is wired (Phase 1 follow-up).
        </p>
      </section>
    </div>
  );
}

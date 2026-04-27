import { Logo } from "@ladx/ui";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900 flex flex-col items-center justify-center gap-6 p-8">
      <Logo size={64} />
      <p className="text-ink-500 max-w-md text-center">
        ladX Studio — Phase 0 placeholder. Project Reader, ladder generator, and TIA Openness
        integration ship in Phase 2.
      </p>
      <p className="text-xs text-ink-400">Air-gapped after activation · Ollama-only inference</p>
    </main>
  );
}

import { Button, Logo } from "@ladx/ui";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900 flex flex-col items-center justify-center gap-8 p-8">
      <Logo size={64} />
      <p className="text-ink-500 max-w-md text-center">
        ladX.ai Cloud — Phase 0 placeholder. The product surfaces (chat, projects, billing) ship in
        Phase 1.
      </p>
      <div className="flex gap-3">
        <Button variant="primary">Try free</Button>
        <Button variant="outline">View pricing</Button>
      </div>
    </main>
  );
}

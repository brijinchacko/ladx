import { Button, Logo } from "@ladx/ui";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <header className="container mx-auto flex items-center justify-between p-6">
        <Logo />
        <nav className="flex items-center gap-6 text-sm">
          <a href="/pricing" className="text-ink-500 hover:text-ink-900">
            Pricing
          </a>
          <a href="/docs" className="text-ink-500 hover:text-ink-900">
            Docs
          </a>
          <a href="/blog" className="text-ink-500 hover:text-ink-900">
            Blog
          </a>
        </nav>
      </header>
      <section className="container mx-auto px-6 py-24 flex flex-col items-center text-center gap-6 max-w-3xl">
        <h1 className="text-5xl font-semibold tracking-tight">
          Local-first PLC AI for engineers who don't trust the cloud.
        </h1>
        <p className="text-ink-500 text-lg">
          Generate ladder, ST, HMI, and regulatory documents — air-gapped on Windows or in the
          cloud. Vendor-IDE integrated. Audit-grade.
        </p>
        <div className="flex gap-3 mt-4">
          <Button variant="primary" size="lg">
            Try free
          </Button>
          <Button variant="outline" size="lg">
            Watch the demo
          </Button>
        </div>
      </section>
    </main>
  );
}

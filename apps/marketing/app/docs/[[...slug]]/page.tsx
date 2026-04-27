import { SiteShell } from "@/components/site-shell";

export default function DocsPage() {
  return (
    <SiteShell>
      <section className="container mx-auto px-6 py-24 max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight mb-4">Docs</h1>
        <p className="text-ink-500">
          Documentation lands as the product ships. For now: see the README in the GitHub repo, or
          email{" "}
          <a href="mailto:hello@ladx.ai" className="underline">
            hello@ladx.ai
          </a>
          .
        </p>
      </section>
    </SiteShell>
  );
}

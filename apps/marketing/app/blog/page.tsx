import { SiteShell } from "@/components/site-shell";

export default function BlogIndex() {
  return (
    <SiteShell>
      <section className="container mx-auto px-6 py-24 max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight mb-4">Blog</h1>
        <p className="text-ink-500">
          Engineering posts on ladder generation, retrieval, and the SPS Nuremberg launch will land
          here. First post: November 2026.
        </p>
      </section>
    </SiteShell>
  );
}

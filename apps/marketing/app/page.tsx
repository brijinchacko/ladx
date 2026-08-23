import { SiteShell } from "@/components/site-shell";
import { Button } from "@ladx/ui";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ladx.ai";

const features: Array<{ title: string; body: string }> = [
  {
    title: "Ladder, not chat",
    body: "Generates IEC 61131-3 ladder XML and ST that compiles. Every output is validated by matiec before you see it.",
  },
  {
    title: "Vendor-IDE integrated",
    body: "Imports directly into TIA Portal, Studio 5000, TwinCAT, and CODESYS via native COM and .NET interop.",
  },
  {
    title: "Air-gapped Studio",
    body: "Studio runs entirely offline against a local Ollama. The only outbound call is a one-time licence activation.",
  },
  {
    title: "Audit-grade by default",
    body: "ALCOA+ audit log records every prompt, retrieval, model output, validator result, and human approval.",
  },
];

export default function HomePage() {
  return (
    <SiteShell>
      <section className="container mx-auto px-6 pt-24 pb-16 flex flex-col items-center text-center gap-6 max-w-3xl">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
          Local-first PLC AI for engineers who don't trust the cloud.
        </h1>
        <p className="text-ink-500 text-lg">
          Generate ladder, ST, HMI, and regulatory documents: air-gapped on Windows or in the cloud.
          Vendor-IDE integrated. Audit-grade.
        </p>
        <div className="flex gap-3 mt-4">
          <a href={`${APP_URL}/sign-up`}>
            <Button variant="primary" size="lg">
              Try ladX.ai Cloud free
            </Button>
          </a>
          <a href="#demo">
            <Button variant="outline" size="lg">
              Watch the demo
            </Button>
          </a>
        </div>
      </section>

      <section className="container mx-auto px-6 py-16 grid md:grid-cols-2 gap-8 max-w-4xl">
        {features.map((f) => (
          <div key={f.title} className="border border-ink-100 rounded-lg p-6">
            <h3 className="font-semibold text-ink-900 mb-2">{f.title}</h3>
            <p className="text-ink-500">{f.body}</p>
          </div>
        ))}
      </section>
    </SiteShell>
  );
}

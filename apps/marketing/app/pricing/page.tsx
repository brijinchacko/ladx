import { SiteShell } from "@/components/site-shell";
import { Button } from "@ladx/ui";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ladx.ai";

interface Tier {
  name: string;
  price: string;
  cadence: string;
  audience: string;
  features: string[];
  cta: { label: string; href: string; variant: "primary" | "outline" };
  highlight?: boolean;
}

const tiers: Tier[] = [
  {
    name: "Free",
    price: "£0",
    cadence: "forever",
    audience: "Students and engineers kicking the tyres",
    features: ["50 prompts / month", "Watermarked output", "L5X + PLCopen import", "Cloud only"],
    cta: { label: "Start free", href: `${APP_URL}/sign-up`, variant: "outline" },
  },
  {
    name: "Pro",
    price: "£29",
    cadence: "per user / month",
    audience: "Working SIs and OEMs",
    features: [
      "Unlimited prompts",
      "All vendor parsers",
      "ST + ladder XML generation",
      "Document export (Phase 3+)",
    ],
    cta: { label: "Upgrade now", href: `${APP_URL}/upgrade/pro`, variant: "primary" },
    highlight: true,
  },
  {
    name: "Studio",
    price: "£499",
    cadence: "per seat / year",
    audience: "Air-gapped Windows desktop",
    features: [
      "Ollama-only inference",
      "TIA Portal / Studio 5000 / TwinCAT / CODESYS",
      "Project Memory",
      "Offline forever after activation",
    ],
    cta: {
      label: "Buy Studio",
      href: "mailto:hello@ladx.ai?subject=ladX%20Studio",
      variant: "outline",
    },
  },
];

export default function PricingPage() {
  return (
    <SiteShell>
      <section className="container mx-auto px-6 py-24 flex flex-col items-center text-center gap-4 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-ink-500">
          Three tiers. Buy the one that fits, not the demo. No "Contact sales" trickery.
        </p>
      </section>
      <section className="container mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6 max-w-5xl">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`rounded-lg border p-8 flex flex-col gap-4 ${
              t.highlight ? "border-teal bg-teal-50" : "border-ink-100 bg-white"
            }`}
          >
            <div>
              <h2 className="text-2xl font-semibold">{t.name}</h2>
              <p className="text-sm text-ink-500">{t.audience}</p>
            </div>
            <div>
              <span className="text-4xl font-semibold">{t.price}</span>
              <span className="text-ink-500"> · {t.cadence}</span>
            </div>
            <ul className="text-sm text-ink-700 space-y-1.5">
              {t.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <a href={t.cta.href} className="mt-auto">
              <Button variant={t.cta.variant} className="w-full">
                {t.cta.label}
              </Button>
            </a>
          </div>
        ))}
      </section>
    </SiteShell>
  );
}

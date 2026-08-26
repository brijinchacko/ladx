import { SITE, breadcrumbSchema, faqSchema, jsonLd, productSchema } from "@/lib/seo/schema";
import Link from "next/link";
import HmiShell from "./hmi-shell";

export const metadata = {
  title: "Free HMI and SCADA builder, online in your browser",
  description:
    "Build operator screens free in the browser. Eighty seven symbols, ISA-18.2 alarms, trends, and a runtime that drives the screen from a real ladder program. No account, no download, no tag limit.",
  alternates: { canonical: `${SITE.url}/hmi` },
  openGraph: {
    type: "website",
    url: `${SITE.url}/hmi`,
    title: "Free HMI and SCADA builder, online",
    description:
      "Draw an operator screen and run it against real ladder logic. No account, no download, no tag limit.",
    images: [{ url: "/og/products/hmi", width: 1200, height: 630, alt: "LADX HMI" }],
  },
};

const FAQ = [
  {
    q: "Is this SCADA software really free?",
    a: "The builder is, with no account, no download, no trial period and no tag limit. That last one matters: most free SCADA is free up to a tag count, and the count is chosen to be just below what a real machine needs. There is no count here because nothing is being licensed.",
  },
  {
    q: "Can I run the HMI without a PLC?",
    a: "Yes, and that is the point of it. Draw a rung in the free ladder editor, come here, and the screen binds to that program's tags and runs against the same scan engine. A start button on glass starts the motor in the logic, the trend fills and the alarms evaluate, with no controller and no panel present.",
  },
  {
    q: "How many alarms and tags can I have?",
    a: "No imposed limit. Alarms follow the ISA-18.2 state machine with deadband, on delay and shelving that expires, and can be generated in bulk from an analogue tag table as a percentage of engineering span rather than defined one at a time.",
  },
  {
    q: "Can I deploy this to a Siemens or Allen Bradley panel?",
    a: "No. It designs, proves and documents the screens, and the connection settings are recorded for handover rather than dialled. Export to a panel runtime is the next substantial thing on its list, and it is worth knowing that before you build a plant on it.",
  },
  {
    q: "What symbols are included?",
    a: "Eighty seven across twelve categories: vessels, pumps and fans, valves, conveying, heat transfer, instruments, switchgear and pipework, in a flat ISA-101 style or a shaded realistic one. Any of them can be replaced with your own SVG or a photograph of the actual machine.",
  },
  {
    q: "Does it talk to real plant equipment?",
    a: "No, and it is not going to. The runtime is the ladder simulator, which is what makes a screen testable at a desk. The driver settings for OPC UA, Modbus TCP, EtherNet/IP or S7 are configured and exported so the design can be handed over, not so that this opens a socket to a machine.",
  },
];

/**
 * The HMI builder, public.
 *
 * It sat behind the sign-in wall, which meant anybody arriving from "free
 * SCADA software" met a login form. The editor already took its persistence as
 * a prop, for the desktop build's sake, so making it work without an account
 * was a matter of passing a different one.
 *
 * The writing under it leads with the tag limit, because that is the catch in
 * nearly every free SCADA product and it is the first thing this audience
 * checks. Saying there is no limit, and then saying plainly that it does not
 * deploy to a panel, is the trade being offered.
 */
export default function HmiPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          productSchema({
            slug: "hmi",
            name: "HMI",
            tagline: "Free HMI and SCADA builder, online",
            summary:
              "A browser HMI and SCADA builder with eighty seven symbols, ISA-18.2 alarms, trends and a runtime driven by a real ladder program.",
            answer:
              "A free browser HMI and SCADA builder with no account, no download and no tag limit. Eighty seven symbols, alarms to the ISA-18.2 state machine, trends, and a runtime that drives the screen from a real ladder program so it can be proven at a desk.",
            features: [
              "Runs in the browser with no account",
              "No tag limit and no licence",
              "Eighty seven process symbols",
              "ISA-18.2 alarm state machine",
              "Runs against real ladder logic",
              "Fourteen real panel sizes",
            ],
            updated: "2026-08-26",
            href: "/hmi",
          }),
        )}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(faqSchema(FAQ, "/hmi"))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "HMI", path: "/hmi" },
          ]),
        )}
      />

      <div className="py-4 sm:py-6">
        <HmiShell />
      </div>

      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14">
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink-900">
          Free HMI and SCADA builder, in the browser
        </h1>
        <p className="mt-4 border-l-2 border-teal-600 pl-5 text-[17px] leading-relaxed text-ink-800">
          Draw an operator screen and run it against real ladder logic, with no account, no download
          and no tag limit. The runtime is the same scan engine the PLC simulator uses, so a start
          button on the glass starts the motor in the program.
        </p>

        <h2 className="mt-12 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          The tag limit, which is usually the catch
        </h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
          Most free SCADA is free up to a number of tags, and the number is chosen carefully: high
          enough to build a demonstration, low enough that a real machine needs the paid tier. You
          find out at the point where the screen is nearly finished.
        </p>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
          There is no tag count here, because nothing is being licensed. What an account adds is a
          project to file the application against, so the screens sit with the program, the drawings
          and the documents, and screen generation from a description, which needs a model and
          therefore a key that belongs to somebody.
        </p>

        <h2 className="mt-12 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          What it will not do
        </h2>
        <ul className="mt-3 space-y-2.5">
          {[
            "It does not talk to plant equipment. The runtime is the simulator, which is what makes a screen testable at a desk.",
            "It does not deploy to a panel. There is no download to a TP1500 or a PanelView.",
            "It is not a historian. Trends are a rolling buffer, not stored history you can query next month.",
            "Scripting is a small expression language over tags, deliberately not a programming language.",
          ].map((l) => (
            <li key={l} className="flex gap-3 text-[15px] leading-relaxed text-ink-600">
              <span aria-hidden="true" className="mt-2.5 h-px w-4 shrink-0 bg-ink-300" />
              {l}
            </li>
          ))}
        </ul>

        <h2 className="mt-12 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          Questions
        </h2>
        <dl className="mt-4 space-y-7">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-[16px] font-semibold leading-snug text-ink-900">{item.q}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-ink-600">{item.a}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 rounded-sm border border-ink-200 bg-ink-50/60 p-6">
          <h2 className="font-display text-[1.1rem] font-bold text-ink-900">
            Start with the logic
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
            The screen binds to a ladder program's tags, so it is worth drawing the rungs first.
            Both editors are free and both keep their work in this browser.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-[14px]">
            <Link href="/ladder" className="font-semibold text-teal-700 underline">
              Free PLC editor and simulator
            </Link>
            <Link href="/cad" className="font-semibold text-teal-700 underline">
              Free online CAD
            </Link>
            <Link href="/products/hmi" className="font-semibold text-teal-700 underline">
              What the full version adds
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

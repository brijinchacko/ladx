import { SITE, breadcrumbSchema, faqSchema, jsonLd, productSchema } from "@/lib/seo/schema";
import Link from "next/link";
import CadShell from "./cad-shell";

export const metadata = {
  // Written for the query rather than for the product. Nobody searches for a
  // tool they have not heard of; they search for "free online CAD".
  title: "Free online CAD for control panels and electrical schematics",
  description:
    "A free browser CAD tool for control panel layouts and electrical schematics. Eleven drawing templates, typed commands, object snap, dimensions, DXF and SVG export. No account, no download, no trial that expires.",
  alternates: { canonical: `${SITE.url}/cad` },
  openGraph: {
    type: "website",
    url: `${SITE.url}/cad`,
    title: "Free online CAD for control panels and schematics",
    description:
      "Draw a panel layout or a schematic in the browser. No account, no download, nothing that expires.",
    images: [{ url: "/og/products/cad", width: 1200, height: 630, alt: "LADX CAD" }],
  },
};

const FAQ = [
  {
    q: "Is this CAD really free?",
    a: "Yes, and free in the way that is usually meant and rarely delivered: no account, no download, no trial period, no watermark and no expiry. The drawing runs in your browser and is saved in your browser. There is no paid tier of this editor to upgrade to.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. Open the page and draw. An account only matters when you want a drawing to follow you between machines and sit alongside a project, its documents and its PLC program, which is what the signed-in version adds.",
  },
  {
    q: "Can I export to DXF?",
    a: "Yes, DXF and SVG both. DXF is the point: it opens in AutoCAD, DraftSight, QElectroTech, LibreCAD and every other package that reads a drawing, so nothing you draw here is trapped here.",
  },
  {
    q: "What can it draw?",
    a: "Lines, rectangles, circles, arcs, polylines, text and dimensions, with object snap and typed commands, on named layers. Eleven templates come with it, numbered the way a control package is read: cover, index, legend, power distribution, control supply, PLC digital and analogue cards, safety, panel general arrangement and terminal schedule.",
  },
  {
    q: "Is it a full AutoCAD replacement?",
    a: "No, and it does not try to be. There is no 3D, no parametric constraints, no blocks library beyond the electrical symbols, and no drawing import yet. It is for the two dimensional electrical and panel drawings an automation project actually produces.",
  },
  {
    q: "Does my drawing get uploaded anywhere?",
    a: "No. Everything runs in the browser and the drawing is stored in the browser. Nothing is sent to a server, which also means clearing your browser data clears the drawing, so export anything you want to keep.",
  },
];

/**
 * CAD, public.
 *
 * It was behind the sign-in wall, which made every claim about a free CAD tool
 * untestable by the person reading it. The drafting was always client side;
 * the only thing an account bought was somewhere to put the drawing, and the
 * browser can do that.
 *
 * The writing under the editor is not padding. Somebody arriving from "free
 * online CAD" has been burned by trials that expire and editors that watermark,
 * and the thing they most need to know is which kind this is. Saying so plainly,
 * including what it cannot do, is both the honest answer and the one that keeps
 * them on the page.
 */
export default function CadPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          productSchema({
            slug: "cad",
            name: "CAD",
            tagline: "Free online CAD for control panels and schematics",
            summary:
              "A browser CAD editor for two dimensional electrical and control panel drawings, with eleven templates, typed commands, object snap, dimensions and DXF export.",
            answer:
              "A free browser CAD tool for control panel layouts and electrical schematics, with no account, no download and nothing that expires. Eleven drawing templates, typed commands, object snap, dimensions, and DXF and SVG export so the drawing opens anywhere else.",
            features: [
              "Runs in the browser with no account",
              "Eleven control package drawing templates",
              "Typed commands and object snap",
              "Dimensions and named layers",
              "DXF and SVG export",
            ],
            updated: "2026-08-26",
            href: "/cad",
          }),
        )}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(faqSchema(FAQ, "/cad"))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "CAD", path: "/cad" },
          ]),
        )}
      />

      <div className="py-4 sm:py-6">
        <CadShell />
      </div>

      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14">
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink-900">
          Free online CAD for control panels and schematics
        </h1>
        <p className="mt-4 border-l-2 border-teal-600 pl-5 text-[17px] leading-relaxed text-ink-800">
          The editor above is the whole thing. No account, no download, no trial period and no
          watermark. It draws the two dimensional electrical and panel drawings an automation
          project actually produces, and exports DXF so nothing you draw is trapped here.
        </p>

        <h2 className="mt-12 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          What free usually means, and what it means here
        </h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
          Most free CAD is free with a condition attached, and the condition is the thing worth
          knowing before you spend an evening on a drawing. Some are thirty day trials. Some are
          free for personal use and licensed the moment the drawing is for a client. Some watermark
          the output. Some are free to draw in and paid to export from, which is the one that hurts.
        </p>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
          This one is free to open, free to draw in, free to export from, and there is no paid tier
          of it. What an account adds is somewhere central to keep drawings and a project to file
          them against, alongside the PLC program and the documents. The drawing tools are the same
          either way.
        </p>

        <h2 className="mt-12 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          What it will not do
        </h2>
        <ul className="mt-3 space-y-2.5">
          {[
            "No 3D. It is a two dimensional drafting tool for electrical and layout drawings.",
            "No parametric constraints or assemblies. It is not a mechanical CAD package.",
            "No DXF import yet. Export works; opening an existing drawing is the next thing on the list.",
            "No plotting to paper sizes with a print driver. Export SVG or DXF and print from there.",
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
          <h2 className="font-display text-[1.1rem] font-bold text-ink-900">The rest of it</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
            The drawings are one part of a control package. The same project holds the ladder
            program, the operator screens and the documents, and the client name is changed once
            rather than on every title block.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-[14px]">
            <Link href="/ladder" className="font-semibold text-teal-700 underline">
              Free PLC editor and simulator
            </Link>
            <Link href="/hmi" className="font-semibold text-teal-700 underline">
              Free HMI and SCADA builder
            </Link>
            <Link href="/products/cad" className="font-semibold text-teal-700 underline">
              What the full version adds
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

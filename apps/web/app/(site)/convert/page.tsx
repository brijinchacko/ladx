import { Eyebrow, GridField } from "@/components/site/squares";
import { SITE, faqSchema, jsonLd } from "@/lib/seo/schema";
import ConvertClient from "./convert-client";

export const metadata = {
  title: "Convert ladder logic to Structured Text, SCL, neutral text or PLCopen XML",
  description:
    "Turn a ladder program into IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML, with a report of everything that did not survive the conversion. Runs in your browser.",
  alternates: { canonical: `${SITE.url}/convert` },
};

const FAQ = [
  {
    q: "Can ladder logic be converted to Structured Text automatically?",
    a: "The logic can, exactly: a contact becomes a boolean term and a coil becomes an assignment. What cannot be converted is the drawing, because Structured Text has no way to express the physical order of contacts or the shape of a branch. Timers, counters and one shots become function block instances with declarations that the original ladder did not have.",
  },
  {
    q: "Is anything uploaded when I convert a program?",
    a: "No. The conversion runs in your browser using JavaScript. The file is read locally with the File API and never sent anywhere, which matters because PLC programs are usually commercially sensitive.",
  },
  {
    q: "Which format keeps the most of my program?",
    a: "Rockwell neutral text, because it preserves branch structure: a parallel branch is written in square brackets, so the ladder shape survives. Structured Text preserves the logic but not the geometry. PLCopen XML carries an ST body here, because vendor support for its graphical ladder representation is inconsistent.",
  },
  {
    q: "Why does my retentive timer need attention after conversion?",
    a: "IEC 61131-3 has TON and TOF but no standard retentive on-delay. A retentive timer holds its accumulated value when the rung goes false and a TON resets it, so substituting one for the other silently changes behaviour. The report flags it rather than making that substitution quietly.",
  },
];

/**
 * Convert.
 *
 * The page is deliberately a tool rather than a description of a tool. Somebody
 * arriving from a search for "ladder to structured text" wants to try it, and
 * the example loads in one click precisely so they can see the output shape
 * before deciding whether to trust it with their own program.
 */
export default function ConvertPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inline for crawlers that do not run scripts.
        dangerouslySetInnerHTML={jsonLd(faqSchema(FAQ, "/convert"))}
      />

      <section className="relative border-b border-ink-100">
        <GridField />
        <div className="relative mx-auto max-w-6xl px-5 py-12">
          <div className="max-w-2xl">
            <Eyebrow>Convert</Eyebrow>
            <h1 className="font-display text-[2.3rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
              Move a program, and see exactly what changed
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
              Ladder into Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML. The
              logic converts exactly. The things that cannot convert exactly are listed, one by one,
              rather than quietly approximated.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-10">
        <ConvertClient />

        <section className="mt-16 border-t border-ink-200 pt-10">
          <h2 className="font-display text-[1.3rem] font-bold tracking-[-0.015em] text-ink-900">
            Common questions
          </h2>
          <dl className="mt-6 grid gap-x-12 gap-y-7 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-display text-[15px] font-bold leading-snug text-ink-900">
                  {item.q}
                </dt>
                <dd className="mt-2 text-[14px] leading-relaxed text-ink-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}

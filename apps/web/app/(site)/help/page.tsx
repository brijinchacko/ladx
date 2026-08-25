import { ContactForm } from "@/components/site/contact-form";
import { SITE, breadcrumbSchema, faqSchema, jsonLd } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  alternates: { canonical: `${SITE.url}/help` },
  title: "Help & contact",
  description:
    "Ask a technical question, report something broken, or talk to us about running LADX on an air-gapped network.",
};

const FAQ = [
  {
    q: "Do I need an account to use the ladder editor?",
    a: "No. Studio runs entirely in the browser and saves projects to the browser. No sign-up, no card, nothing installed. An account only matters when you want projects to follow you between machines.",
  },
  {
    q: "Which AI provider does it use?",
    a: "Whichever you connect. OpenRouter is the default because its free models cost nothing and need only an email to sign up for, and Anthropic, OpenAI or any OpenAI-compatible endpoint, including a local Ollama, work the same way. LADX holds no shared key, so nothing you send is metered or billed by us.",
  },
  {
    q: "Is my PLC code used to train anything?",
    a: "No. Programs are trade secrets and are treated that way: encrypted at rest, scoped to your project, never used for training, and deletable in one action. Anything AI goes to the provider whose key you connected and nowhere else. The desktop build runs a local model and makes no outbound call at all, which is the strongest version of that answer; it is built and not yet distributed as an installer.",
  },
  {
    q: "Can it write to a live controller?",
    a: "No, and that will not change. LADX generates and verifies code; downloading it to a machine is a deliberate act by an engineer with the right tools and the right authority. Nothing here bypasses that.",
  },
  {
    q: "Which file formats can it write?",
    a: "IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text and PLCopen XML, each with a report of what converted cleanly and what did not. Reading a vendor project file back in is not built yet: Convert opens LADX's own export, and importing an L5X or a TIA archive is the next substantial thing on the list.",
  },
  {
    q: "We run an air-gapped OT network. Does that work?",
    a: "That is the case the desktop application exists for: a local model, no outbound connections at all, and an audit trail of every prompt and every accepted output. If you are looking at this for a regulated site, get in touch, it is the deployment we most want to get right.",
  },
  {
    q: "Is the simulator accurate enough to trust?",
    a: "It is accurate about the things people get wrong: the output image, per-instruction edge memory, and timers that count milliseconds rather than scans. It is a teaching and verification tool, not a certification tool, and it does not replace commissioning on real hardware.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      {/*
        The questions were already on the page and were invisible to anything
        assembling an answer. FAQPage is the type answer engines lift most
        readily, and these are the questions people genuinely arrive with.
      */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(faqSchema(FAQ, "/help"))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Help", path: "/help" },
          ]),
        )}
      />
      <header className="mb-14 max-w-2xl">
        <p className="mb-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
          Help
        </p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Ask us something
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          Technical questions get technical answers from people who write this software. If
          something is broken, saying exactly what you did and what happened instead will get it
          fixed faster than anything else.
        </p>
      </header>

      <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <section>
          <h2 className="mb-6 font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            Send a message
          </h2>
          <ContactForm />
        </section>

        <section id="faq">
          <h2 className="mb-6 font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            Asked often
          </h2>
          <dl className="divide-y divide-ink-100 border-y border-ink-100">
            {FAQ.map((item) => (
              <div key={item.q} className="py-5">
                <dt className="mb-2 text-[15.5px] font-semibold leading-snug text-ink-900">
                  {item.q}
                </dt>
                <dd className="text-[14.5px] leading-relaxed text-ink-600">{item.a}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 rounded-sm border border-ink-200 bg-ink-50/70 p-5">
            <h3 className="mb-1.5 text-[14.5px] font-semibold text-ink-900">
              Question that others would benefit from?
            </h3>
            <p className="text-[14px] leading-relaxed text-ink-600">
              Put it in the{" "}
              <Link
                href="/forum"
                className="border-b border-ink-300 text-ink-800 hover:border-ink-900"
              >
                forum
              </Link>{" "}
              instead. Anything asked more than once tends to end up written up properly in{" "}
              <Link
                href="/resources"
                className="border-b border-ink-300 text-ink-800 hover:border-ink-900"
              >
                Resources
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

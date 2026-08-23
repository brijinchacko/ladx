import ReopenConsent from "@/components/consent/reopen-consent";
import { Eyebrow, Sq } from "@/components/site/squares";
import { CATEGORIES } from "@/lib/consent/consent";
import { SITE } from "@/lib/seo/schema";

export const metadata = {
  title: "What we store in your browser",
  description:
    "Every cookie and every browser storage key LADX uses, what it is for, and how long it is kept. One session cookie, plus local storage for your Studio work. No advertising or third party trackers.",
  alternates: { canonical: `${SITE.url}/cookies` },
};

/**
 * The cookie page.
 *
 * A factual description of what the software stores, generated from the same
 * table the consent dialog uses, so the two can never disagree. Keeping one
 * source for both is the point: a cookie policy that has drifted from the code
 * is worse than none, because it is confidently wrong.
 */
export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <header className="mb-10">
        <Eyebrow>Storage</Eyebrow>
        <h1 className="font-display text-[2.2rem] font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900">
          What we store in your browser
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          Less than you are probably expecting. LADX sets one cookie, to keep you signed in, and
          uses your browser's local storage so Studio can keep your ladder program on your own
          machine. There is no advertising network here, no third party tracker, and nothing that
          follows you to other sites.
        </p>
      </header>

      <section className="mb-12 border-l-2 border-teal-600 py-1 pl-5">
        <h2 className="font-display text-[16px] font-bold text-ink-900">The short version</h2>
        <ul className="mt-3 space-y-2">
          {[
            "One cookie, ladx_session, so that signing in sticks.",
            "Your Studio project stays in your browser and is never uploaded.",
            "No analytics is running today. If we add any, it stays off until you allow it.",
            "Rejecting optional storage genuinely works. It also means Studio cannot save your work between visits.",
          ].map((line) => (
            <li
              key={line}
              className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-ink-700"
            >
              <Sq size={5} className="mt-[8px] shrink-0 text-teal-600" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      {CATEGORIES.map((cat) => (
        <section key={cat.id} className="mb-11">
          <h2 className="mb-2 flex flex-wrap items-baseline gap-3 font-display text-[1.2rem] font-bold tracking-[-0.012em] text-ink-900">
            {cat.name}
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              {cat.required ? "always on" : "your choice"}
            </span>
          </h2>
          <p className="mb-4 text-[15px] leading-relaxed text-ink-600">{cat.summary}</p>

          {cat.items.length > 0 ? (
            <div className="overflow-x-auto border border-ink-200">
              <table className="w-full border-collapse text-left">
                <thead className="bg-ink-50">
                  <tr>
                    {["Name", "Kind", "Purpose", "Kept for"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap border-b border-ink-200 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cat.items.map((item) => (
                    <tr key={item.name} className="align-top">
                      <td className="border-b border-ink-100 px-3 py-2.5 font-mono text-[12px] text-ink-800">
                        {item.name}
                      </td>
                      <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2.5 text-[13px] text-ink-500">
                        {item.kind}
                      </td>
                      <td className="border-b border-ink-100 px-3 py-2.5 text-[13px] leading-relaxed text-ink-600">
                        {item.purpose}
                      </td>
                      <td className="border-b border-ink-100 px-3 py-2.5 text-[13px] text-ink-500">
                        {item.retention}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border border-dashed border-ink-200 px-4 py-3 font-mono text-[12.5px] text-ink-400">
              Nothing in this category is in use today.
            </p>
          )}
        </section>
      ))}

      <section className="mb-11">
        <h2 className="mb-3 font-display text-[1.2rem] font-bold tracking-[-0.012em] text-ink-900">
          Changing your mind
        </h2>
        <p className="mb-4 text-[15px] leading-relaxed text-ink-600">
          You can change these choices at any time, and turning a category off deletes what it
          covered rather than just stopping new writes. Withdrawing functional storage clears your
          saved Studio project from this browser, which cannot be undone.
        </p>
        <ReopenConsent />
      </section>

      <section>
        <h2 className="mb-3 font-display text-[1.2rem] font-bold tracking-[-0.012em] text-ink-900">
          Clearing it yourself
        </h2>
        <p className="text-[15px] leading-relaxed text-ink-600">
          Everything on this page lives in your own browser, so your browser can remove all of it.
          Clearing site data for ladx.ai signs you out and deletes any saved Studio project. There
          is no server side copy of your Studio work to clear, because it was never sent to us.
        </p>
      </section>
    </div>
  );
}

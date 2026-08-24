import { SITE, jsonLd, softwareSchema } from "@/lib/seo/schema";
import StudioShell from "./studio-shell";

export const metadata = {
  title: "Ladder, the browser ladder logic editor and simulator",
  description:
    "Draw ladder logic and watch it run. A scan-accurate PLC simulator with a real output image, per-instruction edge memory and timers that count milliseconds. No account, runs in the browser.",
  alternates: { canonical: `${SITE.url}/studio` },
};

/**
 * The ladder workbench.
 *
 * Inside the site shell rather than beside it, so a visitor who lands here from
 * a search result can see whose tool this is and get to the rest of the site.
 * The editor hides that shell on demand; see StudioShell.
 */
export default function StudioPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has to be inline for crawlers that do not run scripts.
        dangerouslySetInnerHTML={jsonLd(softwareSchema())}
      />
      <div className="py-4 sm:py-6">
        <StudioShell />
      </div>
    </>
  );
}

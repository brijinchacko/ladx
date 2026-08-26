import { SITE, jsonLd, softwareSchema } from "@/lib/seo/schema";
import StudioShell from "./studio-shell";

export const metadata = {
  // The product is called Ladder; nobody searches for that. They search for
  // free PLC programming software and an online PLC simulator, so the title
  // leads with what it is rather than with what we named it.
  title: "Free online PLC programming software and ladder logic simulator",
  description:
    "Write ladder logic free in your browser and run it on a scan-accurate PLC simulator: real output image, per-instruction edge memory, timers in milliseconds. No account, no download, nothing that expires.",
  alternates: { canonical: `${SITE.url}/ladder` },
  openGraph: {
    type: "website",
    url: `${SITE.url}/ladder`,
    title: "Free online PLC programming and ladder logic simulator",
    description:
      "Draw a rung, press run, watch it conduct. No account, no download, nothing that expires.",
    images: [{ url: "/og/products/studio", width: 1200, height: 630, alt: "LADX Ladder" }],
  },
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

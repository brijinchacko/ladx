import DownloadClient from "@/app/(site)/download/download-client";
import { DESKTOP_BUILDS, DESKTOP_VERSION } from "@/content/desktop-release";
import { SITE, breadcrumbSchema, jsonLd } from "@/lib/seo/schema";

export const metadata = {
  alternates: { canonical: `${SITE.url}/download` },
  title: "Download LADX Studio for Mac and Windows",
  description:
    "The desktop build of LADX Studio runs entirely on your own machine: the ladder editor, the simulator, the HMI builder and Convert, with a local Ollama model doing the inference and no project leaving the computer. Free to use in the browser instead.",
};

/**
 * Download.
 *
 * The desktop app exists for one reason, so the page leads with it: a plant
 * that will not put its control programs on somebody else's server. Everything
 * here is aimed at the person who has to justify installing it, which is why
 * the requirements, the signing state and what it cannot do are on the page
 * rather than in a FAQ.
 */
export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Download", path: "/download" },
          ]),
        )}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "LADX Studio",
          applicationCategory: "DeveloperApplication",
          operatingSystem: DESKTOP_BUILDS.map((b) => b.platform).join(", "),
          softwareVersion: DESKTOP_VERSION,
          url: `${SITE.url}/download`,
          description:
            "A local-first PLC engineering studio: ladder editor and simulator, HMI builder, and conversion between vendor formats, running entirely on the engineer's own machine.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        })}
      />

      <DownloadClient />
    </div>
  );
}

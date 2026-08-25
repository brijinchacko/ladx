import { sortedPosts } from "@/content/posts";
import { PRODUCTS } from "@/content/products";
import { SITE } from "@/lib/seo/schema";

/**
 * llms.txt.
 *
 * Included with clear eyes about what it is worth. Measurements across hundreds
 * of millions of AI crawler visits found the file fetched a few hundred times:
 * GPTBot, ClaudeBot and PerplexityBot overwhelmingly crawl HTML directly, and
 * no major provider has committed to reading it. Google has said it will not.
 *
 * It costs one generated route and might matter later, so it exists. The real
 * work is elsewhere: server-rendered HTML, structured data, and being in Bing's
 * index, which is what ChatGPT actually retrieves from.
 */
export async function GET() {
  const posts = sortedPosts();
  const lines = [
    "# LADX",
    "",
    `> ${SITE.description}`,
    "",
    "LADX is vendor-neutral: ladder is held in one intermediate representation based on PLCopen TC6, and written out as IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML. Reading a vendor project file back in is not built yet. Generated PLC code is compiled and statically checked before it is shown, and the ladder simulator models the output image, per-instruction edge memory and elapsed-time timers.",
    "",
    "## Products",
    "",
    ...PRODUCTS.map(
      (p) => `- [${p.name}](${SITE.url}/products/${p.slug}): ${p.tagline} ${p.summary}`,
    ),
    "",
    "## Articles",
    "",
    ...posts.map((p) => `- [${p.title}](${SITE.url}/resources/${p.slug}): ${p.answer}`),
    "",
    "## Tools",
    "",
    `- [Studio](${SITE.url}/studio): A browser ladder logic editor and scan-accurate PLC simulator. No account required.`,
    "",
    "## Contact",
    "",
    `- [Help and contact](${SITE.url}/help)`,
    `- [Forum](${SITE.url}/forum)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
